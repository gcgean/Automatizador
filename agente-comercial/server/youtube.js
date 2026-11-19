import crypto from 'node:crypto';
import {encryptSecret} from './secrets.js';

// YouTube: não há mensagem privada. A plataforma lê os comentários dos vídeos do canal, a IA separa quem
// demonstrou interesse e prepara uma resposta curta e pública convidando para o WhatsApp da empresa.
// Só os interessados viram atendimento; a resposta é publicada após aprovação (ou direto, se a conexão permitir).
const API='https://www.googleapis.com/youtube/v3',TOKEN_URL='https://oauth2.googleapis.com/token',AUTH_URL='https://accounts.google.com/o/oauth2/v2/auth';
export const YOUTUBE_SCOPE='https://www.googleapis.com/auth/youtube.force-ssl';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const LOOKBACK_DAYS=3,MAX_ATTEMPTS=3,REPLY_LIMIT=500;

// O atendimento usa um identificador só de dígitos; o do autor no YouTube (UC...) vira um número estável.
export const youtubeKey=channelId=>'9'+BigInt('0x'+crypto.createHash('sha256').update(String(channelId)).digest('hex').slice(0,15)).toString().padStart(18,'0');
export const videoUrl=videoId=>videoId?'https://www.youtube.com/watch?v='+encodeURIComponent(videoId):'';
export const whatsappLink=phone=>{const digits=String(phone||'').replace(/\D/g,'');return digits.length>=10?'https://wa.me/'+digits:'';};

// Garante o link do WhatsApp na resposta e remove qualquer outro endereço que a IA tenha inventado.
export function finishReply(text,link,name){
 let reply=String(text||'').replace(/https?:\/\/\S+/gi,m=>link&&m.replace(/[.,;!?)]+$/,'')===link?m:'').replace(/[ \t]+/g,' ').replace(/\s+([.,!?])/g,'$1').trim();
 if(!reply)reply=(name?'Olá, '+name+'! ':'Olá! ')+'Obrigado pelo interesse. Fale com a gente pelo WhatsApp que explicamos tudo:';
 if(link&&!reply.includes(link))reply=reply.replace(/[\s:]*$/,'')+(/[.!?]$/.test(reply)?' ':': ')+link;
 return reply.slice(0,REPLY_LIMIT);
}

const escapeHtml=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c]);
// Página exibida na aba que o Google devolve depois da autorização.
export function callbackPage(ok,message){
 return '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>YouTube · Command Comercial</title><style>:root{color-scheme:light dark}body{font-family:system-ui,sans-serif;max-width:520px;margin:12vh auto;padding:0 16px;line-height:1.5;background:Canvas;color:CanvasText}h1{font-size:22px}a{color:#087bf2}</style></head><body><h1>'+(ok?'Canal do YouTube conectado':'Não foi possível conectar o YouTube')+'</h1><p>'+escapeHtml(message)+'</p><p><a href="/">Voltar para a plataforma</a> · você também pode fechar esta aba.</p></body></html>';
}

export async function googleToken(config,fetchImpl,cache){
 if(!config.accessToken)throw fail('Conecte a conta Google do canal em Configurações → Conexões.',409);
 const hit=cache?.get(config.connectionId);if(hit&&hit.refresh===config.accessToken&&hit.exp>Date.now()+60000)return hit.token;
 let response;try{response=await fetchImpl(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({client_id:config.appId,client_secret:config.appSecret,refresh_token:config.accessToken,grant_type:'refresh_token'}),signal:AbortSignal.timeout(15000)});}
 catch{throw fail('Falha de conexão com o Google. Tente de novo em instantes.',424);}
 const data=await response.json().catch(()=>({}));
 if(!response.ok||!data.access_token)throw fail(data.error==='invalid_grant'?'O acesso ao YouTube expirou ou foi removido. Conecte a conta Google de novo em Configurações → Conexões.':'O Google recusou o acesso ao YouTube ('+(data.error||response.status)+').',424);
 cache?.set(config.connectionId,{token:data.access_token,refresh:config.accessToken,exp:Date.now()+(Number(data.expires_in)||3600)*1000});
 return data.access_token;
}

export class YouTubeClient{
 constructor(config,fetchImpl=fetch,store=null,cache=null){this.config=config;this.fetch=fetchImpl;this.store=store;this.cache=cache;}
 async api(path,{method='GET',body}={}){
  const token=await googleToken(this.config,this.fetch,this.cache);let response;
  try{response=await this.fetch(API+path,{method,headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});}
  catch(cause){const e=fail('Falha de conexão com o YouTube. Confira no vídeo antes de responder de novo.',424);e.code=cause.name;throw e;}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
   const reason=data?.error?.errors?.[0]?.reason||data?.error?.status||'';
   const why=reason==='quotaExceeded'?'limite diário do YouTube atingido; tente amanhã':reason==='commentsDisabled'?'os comentários deste vídeo estão desativados':response.status===403?'sem permissão para esta ação no canal':response.status===404?'comentário ou vídeo não encontrado (pode ter sido apagado)':data?.error?.message||'falha';
   throw fail('YouTube ('+(reason||response.status)+'): '+why,[400,403,404].includes(response.status)?409:424);
  }
  return data;
 }
 async latestThread(phone){
  const {rows}=await this.store.pool.query('SELECT thread_id FROM youtube_comments WHERE connection_id=$1 AND author_key=$2 ORDER BY published_at DESC NULLS LAST LIMIT 1',[this.config.connectionId,phone]);
  return rows[0]?.thread_id||null;
 }
 // Responde publicamente ao comentário (o mais recente do contato, ou o indicado em metadata.threadId).
 async sendText(to,text,metadata={}){
  const {threadId:chosen,...meta}=metadata,threadId=chosen||await this.latestThread(to);
  if(!threadId)throw fail('Não há comentário deste contato para responder.',409);
  const body=String(text||'').trim().slice(0,REPLY_LIMIT*4);if(!body)throw fail('Escreva a resposta.',400);
  const event={id:crypto.randomUUID(),phone:to,direction:'out',text:body,state:'sending',channel:'youtube',threadId,...meta};
  await this.store?.recordEvent(event);
  try{
   const data=await this.api('/comments?part=snippet',{method:'POST',body:{snippet:{parentId:threadId,textOriginal:body}}});
   if(!data.id)throw fail('O YouTube não confirmou a resposta. Confira no vídeo antes de responder de novo.',424);
   await this.store?.recordEvent({...event,messageId:data.id,state:'accepted'});
   await this.store?.pool.query("UPDATE youtube_comments SET status='replied',reply_id=$3,replied_at=now() WHERE connection_id=$1 AND thread_id=$2",[this.config.connectionId,threadId,data.id]);
   return {messages:[{id:data.id}]};
  }catch(error){await this.store?.recordEvent({...event,state:error.status===409?'failed':'uncertain',error:error.message});throw error;}
 }
 sendInteractive(to,text,interactive,metadata={}){return this.sendText(to,text||interactive?.body?.text||'',metadata);}
 async sendMedia(){throw fail('No YouTube a resposta é um comentário de texto; anexos não são enviados.',409);}
 async sendTemplate(){throw fail('O YouTube não usa modelos aprovados. A resposta é um comentário no vídeo.',409);}
 async markRead(){return null;}
}

const SYSTEM=`Você faz a triagem de comentários do canal de YouTube de uma empresa de software.
Decida se o comentário mostra INTERESSE comercial: perguntas sobre preço, planos, como contratar, se serve para a empresa da pessoa, pedido de contato, demonstração, suporte para usar o produto ou dúvida sobre funcionalidades.
NÃO é interesse: elogio ou agradecimento sem pergunta, piada, spam, links, ofensa, propaganda de outra empresa, conversa entre usuários sem relação com o produto.
Se houver interesse, escreva uma resposta pública em português do Brasil, com no máximo 2 frases curtas: cumprimente pelo primeiro nome (se houver), agradeça o interesse e convide para falar no WhatsApp da empresa. Não informe preços, prazos nem promessas; não peça dados pessoais; não use hashtags; não escreva links (o link é colocado depois).
Responda somente com JSON válido: {"interesse":true|false,"motivo":"até 8 palavras","resposta":"texto ou vazio"}`;

export class YouTubeService{
 constructor(store,registry,{fetchImpl,providerFactory,log=console}={}){this.store=store;this.registry=registry;this.fetch=fetchImpl||registry.fetch;this.providerFactory=providerFactory;this.log=log;this.tokens=new Map();this.running=null;}
 get pool(){return this.store.pool;}
 redirectUri(){return this.registry.config.publicUrl.replace(/\/$/,'')+'/youtube/callback';}
 client(config,store=null){return new YouTubeClient(config,this.fetch,store,this.tokens);}
 sign(payload){const body=Buffer.from(JSON.stringify(payload)).toString('base64url');return body+'.'+crypto.createHmac('sha256',this.registry.config.connectionsKey).update('youtube:'+body).digest('base64url');}
 unsign(state){
  const [body,mac]=String(state||'').split('.');if(!body||!mac)return null;
  const expected=crypto.createHmac('sha256',this.registry.config.connectionsKey).update('youtube:'+body).digest('base64url');
  if(mac.length!==expected.length||!crypto.timingSafeEqual(Buffer.from(mac),Buffer.from(expected)))return null;
  try{const data=JSON.parse(Buffer.from(body,'base64url').toString());return data.exp>Date.now()?data:null;}catch{return null;}
 }
 async settings(connectionId){const {rows}=await this.pool.query('SELECT * FROM youtube_channels WHERE connection_id=$1',[connectionId]);return rows[0]||null;}
 checkLink(link){
  const clean=typeof link==='string'?link.trim():'';
  if(clean&&(clean.length>300||!/^https:\/\/(wa\.me\/\d{10,15}|api\.whatsapp\.com\/send\?phone=\d{10,15})\S*$/.test(clean)))throw fail('Informe o link do WhatsApp no formato https://wa.me/5585999999999.');
  return clean;
 }
 async saveSettings(connectionId,{whatsappLink:link,autoReply}={}){
  const clean=this.checkLink(link);
  await this.pool.query(`INSERT INTO youtube_channels(connection_id,whatsapp_link,auto_reply) VALUES($1,$2,$3) ON CONFLICT(connection_id) DO UPDATE SET whatsapp_link=excluded.whatsapp_link,auto_reply=excluded.auto_reply`,[connectionId,clean,autoReply===true]);
 }
 // Link usado nas respostas: o configurado na conexão ou o primeiro WhatsApp ativo da mesma empresa.
 async link(connectionId){
  const s=await this.settings(connectionId);if(s?.whatsapp_link)return s.whatsapp_link;
  const {rows}=await this.pool.query(`SELECT w.display_phone FROM whatsapp_connections y JOIN whatsapp_connections w ON w.company_id=y.company_id AND w.channel='whatsapp' AND w.enabled WHERE y.id=$1 ORDER BY w.id='default' DESC,w.name LIMIT 1`,[connectionId]);
  return whatsappLink(rows[0]?.display_phone);
 }
 async authorizeUrl(connectionId,userId){
  const c=await this.registry.configFor(connectionId);
  if(c.channel!=='youtube')throw fail('Esta conexão não é do YouTube.');
  if(!c.appId||!c.appSecret)throw fail('Salve o ID do cliente e a chave secreta do Google antes de conectar.');
  const state=this.sign({c:connectionId,u:userId||null,exp:Date.now()+15*60000});
  return AUTH_URL+'?'+new URLSearchParams({client_id:c.appId,redirect_uri:this.redirectUri(),response_type:'code',scope:YOUTUBE_SCOPE,access_type:'offline',prompt:'consent',include_granted_scopes:'true',state});
 }
 // Retorno do Google: troca o código pelo token permanente, descobre o canal e ativa a conexão.
 async callback(params){
  if(params.get('error'))throw fail(params.get('error')==='access_denied'?'A autorização foi cancelada na conta Google.':'O Google não autorizou: '+params.get('error'));
  const state=this.unsign(params.get('state'));if(!state)throw fail('Link de autorização inválido ou expirado. Volte à plataforma e clique em "Conectar com o Google" de novo.');
  const c=await this.registry.configFor(state.c);if(c.channel!=='youtube')throw fail('Conexão não encontrada.',404);
  let response;try{response=await this.fetch(TOKEN_URL,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({code:String(params.get('code')||''),client_id:c.appId,client_secret:c.appSecret,redirect_uri:this.redirectUri(),grant_type:'authorization_code'}),signal:AbortSignal.timeout(15000)});}catch{throw fail('Falha de conexão com o Google. Tente de novo.',424);}
  const token=await response.json().catch(()=>({}));
  if(!response.ok||!token.access_token)throw fail('O Google recusou a autorização ('+(token.error||response.status)+'). Confira o ID do cliente, a chave secreta e o endereço de retorno cadastrado.',424);
  if(!token.refresh_token)throw fail('O Google não enviou o acesso permanente. Remova o acesso do app em myaccount.google.com/permissions e conecte de novo.',424);
  if(!String(token.scope||YOUTUBE_SCOPE).includes('youtube'))throw fail('A permissão do YouTube não foi concedida. Conecte de novo e marque a opção do YouTube.');
  const cache=new Map(),client=new YouTubeClient({...c,accessToken:token.refresh_token},this.fetch,null,cache);
  cache.set(c.connectionId,{token:token.access_token,refresh:token.refresh_token,exp:Date.now()+(Number(token.expires_in)||3600)*1000});
  const channel=(await client.api('/channels?part=snippet&mine=true')).items?.[0];
  if(!channel?.id)throw fail('Esta conta Google não tem canal no YouTube. Entre com a conta dona do canal.');
  const title=channel.snippet?.customUrl||channel.snippet?.title||'';
  try{await this.pool.query('UPDATE whatsapp_connections SET phone_number_id=$2,display_phone=$3,access_token_cipher=$4,enabled=true,updated_at=now() WHERE id=$1',[c.connectionId,channel.id,title,encryptSecret(token.refresh_token,this.registry.config.connectionsKey)]);}
  catch(e){if(e.code==='23505')throw fail('Este canal do YouTube já está ligado a outra conexão.',409);throw e;}
  await this.pool.query(`INSERT INTO youtube_channels(connection_id,channel_id,channel_title,connected_at) VALUES($1,$2,$3,now()) ON CONFLICT(connection_id) DO UPDATE SET channel_id=excluded.channel_id,channel_title=excluded.channel_title,connected_at=COALESCE(youtube_channels.connected_at,excluded.connected_at),last_error=NULL`,[c.connectionId,channel.id,channel.snippet?.title||'']);
  this.tokens.set(c.connectionId,{token:token.access_token,refresh:token.refresh_token,exp:Date.now()+(Number(token.expires_in)||3600)*1000});
  this.registry.runtimes?.delete(c.connectionId);
  return {connectionId:c.connectionId,channelTitle:channel.snippet?.title||title};
 }
 async tick(){
  if(this.running)return this.running;
  this.running=(async()=>{for(const c of await this.registry.list()){if(c.channel==='youtube'&&c.enabled)try{await this.poll(c.id);}catch(error){await this.pool.query('UPDATE youtube_channels SET last_error=$2 WHERE connection_id=$1',[c.id,String(error.message).slice(0,300)]).catch(()=>{});this.log.error?.('[youtube]',c.name+':',error.message);}}})().finally(()=>{this.running=null;});
  return this.running;
 }
 async classify(connectionId,comment){
  const provider=this.providerFactory((await this.store.scope(connectionId).getConnection()).provider);
  const result=await provider.complete({system:SYSTEM,tools:[],messages:[{role:'user',content:'Vídeo: '+JSON.stringify(comment.videoTitle||'')+'\nAutor: '+JSON.stringify(comment.authorName||'')+'\nComentário: '+JSON.stringify(comment.text)}]});
  const json=JSON.parse(String(result.text||'').replace(/^[^{]*/,'').replace(/[^}]*$/,''));
  if(typeof json.interesse!=='boolean')throw new Error('Resposta da IA sem classificação.');
  return {interest:json.interesse,reason:String(json.motivo||'').slice(0,120),reply:typeof json.resposta==='string'?json.resposta:''};
 }
 async poll(connectionId){
  const config=await this.registry.configFor(connectionId),settings=await this.settings(connectionId);
  const channelId=settings?.channel_id||config.phoneNumberId;if(!/^UC[\w-]{10,}$/.test(channelId||''))throw fail('Canal do YouTube ainda não conectado.',409);
  const client=this.client(config),since=Date.parse(settings?.connected_at||new Date())-LOOKBACK_DAYS*86400000;
  const data=await client.api('/commentThreads?'+new URLSearchParams({part:'snippet,replies',allThreadsRelatedToChannelId:channelId,maxResults:'50',order:'time',textFormat:'plainText'}));
  for(const item of data.items||[]){
   const top=item.snippet?.topLevelComment?.snippet||{},author=top.authorChannelId?.value||'',published=Date.parse(top.publishedAt||'');
   if(!item.id||!author||author===channelId||!(published>=since))continue;
   const answered=(item.replies?.comments||[]).some(r=>r.snippet?.authorChannelId?.value===channelId);
   await this.pool.query(`INSERT INTO youtube_comments(connection_id,thread_id,comment_id,video_id,author_channel_id,author_key,author_name,text,published_at,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT DO NOTHING`,[connectionId,item.id,item.snippet?.topLevelComment?.id||item.id,item.snippet?.videoId||top.videoId||'',author,youtubeKey(author),String(top.authorDisplayName||'').slice(0,120),String(top.textOriginal||top.textDisplay||'').slice(0,5000),new Date(published).toISOString(),answered?'answered_elsewhere':'new']);
  }
  const {rows}=await this.pool.query(`SELECT * FROM youtube_comments WHERE connection_id=$1 AND status='new' ORDER BY published_at LIMIT 20`,[connectionId]);
  if(!rows.length)return {processed:0};
  const ids=[...new Set(rows.map(r=>r.video_id).filter(id=>id&&!rows.find(x=>x.video_id===id)?.video_title))];
  const titles=new Map();if(ids.length){const videos=await client.api('/videos?'+new URLSearchParams({part:'snippet',id:ids.join(',')})).catch(()=>({items:[]}));for(const v of videos.items||[])titles.set(v.id,String(v.snippet?.title||'').slice(0,200));}
  const runtime=await this.registry.runtime(connectionId),link=await this.link(connectionId);
  for(const row of rows){
   const title=titles.get(row.video_id)||row.video_title||'';let verdict;
   try{verdict=await this.classify(connectionId,{videoTitle:title,authorName:row.author_name,text:row.text});}
   catch(error){
    if(row.attempts+1<MAX_ATTEMPTS){await this.pool.query('UPDATE youtube_comments SET attempts=attempts+1,video_title=$3 WHERE connection_id=$1 AND thread_id=$2',[connectionId,row.thread_id,title]);continue;}
    verdict={interest:true,reason:'IA indisponível; conferir',reply:''};
   }
   const first=String(row.author_name||'').replace(/^@/,'').split(/[\s._-]+/)[0]||'';
   const suggestion=verdict.interest?finishReply(verdict.reply,link,first&&/^[\p{L}]{2,}$/u.test(first)?first[0].toUpperCase()+first.slice(1):''):null;
   await this.pool.query('UPDATE youtube_comments SET status=$3,suggestion=$4,reason=$5,video_title=$6,attempts=attempts+1 WHERE connection_id=$1 AND thread_id=$2',[connectionId,row.thread_id,verdict.interest?'pending':'ignored',suggestion,verdict.reason,title]);
   if(!verdict.interest)continue;
   const handle=String(row.author_name||'').startsWith('@')?row.author_name.slice(1):'';
   await runtime.inbox.accept({id:'yt-'+row.comment_id,from:row.author_key,name:handle||row.author_name,text:'[Comentário no vídeo "'+(title||'sem título')+'"] '+row.text,type:'text',timestamp:String(Math.floor(Date.parse(row.published_at)/1000)),connectionId,youtube:{threadId:row.thread_id,videoId:row.video_id,videoTitle:title,handle}});
  }
  await this.pool.query('UPDATE youtube_channels SET last_poll_at=now(),last_error=NULL WHERE connection_id=$1',[connectionId]);
  return {processed:rows.length};
 }
 // Chamado depois que o comentário entrou no atendimento: no modo automático, publica a resposta sugerida.
 async afterInbound(connectionId,message){
  if(!message.youtube?.threadId||!(await this.settings(connectionId))?.auto_reply)return;
  const {rows}=await this.pool.query("SELECT suggestion FROM youtube_comments WHERE connection_id=$1 AND thread_id=$2 AND status='pending'",[connectionId,message.youtube.threadId]);
  if(!rows[0]?.suggestion)return;
  const runtime=await this.registry.runtime(connectionId);
  try{await runtime.agent.whatsapp.sendText(message.from,rows[0].suggestion,{actor:'ai',threadId:message.youtube.threadId});}
  catch(error){await this.pool.query("UPDATE youtube_comments SET status='error',reason=$3 WHERE connection_id=$1 AND thread_id=$2",[connectionId,message.youtube.threadId,String(error.message).slice(0,300)]);}
 }
 async pending(connectionId,phone){
  const {rows}=await this.pool.query(`SELECT thread_id,video_id,video_title,text,published_at,status,suggestion,reason FROM youtube_comments WHERE connection_id=$1 AND author_key=$2 AND status IN ('pending','error') ORDER BY published_at DESC LIMIT 10`,[connectionId,phone]);
  return {items:rows.map(r=>({threadId:r.thread_id,videoTitle:r.video_title,videoUrl:videoUrl(r.video_id),text:r.text,publishedAt:r.published_at,status:r.status,suggestion:r.suggestion||'',error:r.status==='error'?r.reason:null}))};
 }
 async thread(connectionId,phone,threadId){
  const {rows}=await this.pool.query('SELECT status FROM youtube_comments WHERE connection_id=$1 AND author_key=$2 AND thread_id=$3',[connectionId,phone,threadId]);
  if(!rows[0])throw fail('Comentário não encontrado neste atendimento.',404);return rows[0];
 }
 async reply(connectionId,phone,threadId,text,user){
  if((await this.thread(connectionId,phone,threadId)).status==='replied')throw fail('Este comentário já foi respondido.',409);
  if(typeof text!=='string'||!text.trim()||text.length>REPLY_LIMIT*4)throw fail('Escreva a resposta (até 2.000 caracteres).');
  const runtime=await this.registry.runtime(connectionId);
  await runtime.agent.whatsapp.sendText(phone,text.trim(),{actor:'human',threadId,...(user?{userId:user.id,userName:user.name||user.email}:{})});
  return this.pending(connectionId,phone);
 }
 async discard(connectionId,phone,threadId){
  await this.thread(connectionId,phone,threadId);
  await this.pool.query("UPDATE youtube_comments SET status='discarded' WHERE connection_id=$1 AND thread_id=$2 AND status<>'replied'",[connectionId,threadId]);
  return this.pending(connectionId,phone);
 }
}
