// Canal Instagram Direct: a conta do Instagram é uma "conexão" e o IGSID (identificador numérico
// do cliente no Instagram) ocupa o lugar do telefone. Assim atendimentos, cards, motivos e relatórios
// funcionam sem mudança.
import crypto from 'node:crypto';
import {Readable} from 'node:stream';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export const IG_WINDOW_MS=24*3600e3,IG_HUMAN_MS=7*24*3600e3;
const LIMIT={image:8*1024*1024,audio:25*1024*1024,video:25*1024*1024,document:25*1024*1024};
const MEDIA_HOSTS=['fbsbx.com','fbcdn.net','cdninstagram.com','instagram.com','facebook.com'];
const KIND={image:'image',audio:'audio',video:'video',file:'document'};

// Token do login do Instagram (IGAA…) usa graph.instagram.com; token de Página usa graph.facebook.com.
export const igBase=(config)=>(/^IG/.test(config.accessToken||'')?'https://graph.instagram.com/':'https://graph.facebook.com/')+(config.graphVersion||'v21.0');

function describeAttachment(att){
 const url=att?.payload?.url||'';
 if(att?.type==='story_mention')return '[O cliente mencionou a empresa em um story.]';
 if(['share','ig_reel','reel','ig_post'].includes(att?.type))return '[O cliente compartilhou uma publicação'+(att.payload?.title?': '+att.payload.title:'')+'.]';
 if(att?.type==='fallback')return '[O cliente enviou um link'+(url?': '+url:'')+'.]';
 return null;
}

// Converte o webhook do Instagram no mesmo formato de mensagem que o WhatsApp entrega à caixa de entrada.
export function extractInstagram(payload,accountId){
 const out=[];if(payload?.object!=='instagram')return out;
 for(const entry of payload.entry||[]){
  if(String(entry.id)!==String(accountId))continue;
  for(const ev of entry.messaging||[]){
   const from=String(ev.sender?.id||'');if(!/^\d{5,40}$/.test(from)||from===String(accountId))continue;
   const timestamp=ev.timestamp?Math.floor(Number(ev.timestamp)/1000):undefined;
   if(ev.message){
    const m=ev.message;if(m.is_echo||m.is_deleted||!m.mid)continue;
    const att=(m.attachments||[])[0],kind=KIND[att?.type],story=m.reply_to?.story?'[Resposta ao seu story] ':'';
    const text=story+(m.text||describeAttachment(att)||(kind?'':'[Mensagem sem texto]'));
    out.push({id:m.mid,...(m.reply_to?.story||(m.attachments||[]).some(a=>a.type==='story_mention')?{ignoreAutomation:true,automationIgnoredReason:'instagram_story'}:{}),...(timestamp?{timestamp}:{}),from,name:'',type:kind||'text',text,...(m.quick_reply?.payload?{interactiveReplyId:String(m.quick_reply.payload)}:{}),...(kind&&att.payload?.url?{media:{kind,id:'ig-'+crypto.createHash('sha256').update(m.mid).digest('hex').slice(0,32),url:att.payload.url,mime:'',filename:'',caption:m.text||''}}:{})});
   }else if(ev.reaction?.mid){
    out.push({id:'ig-reaction-'+ev.reaction.mid+'-'+(ev.timestamp||''),...(timestamp?{timestamp}:{}),from,name:'',type:'reaction',text:ev.reaction.action==='unreact'?'[O cliente removeu a reação de uma mensagem.]':'[O cliente reagiu com '+(ev.reaction.emoji||'❤️')+' a uma mensagem.]'});
   }else if(ev.postback?.mid){
    out.push({id:ev.postback.mid,...(timestamp?{timestamp}:{}),from,name:'',type:'interactive',text:ev.postback.title||'',interactiveReplyId:String(ev.postback.payload||'')});
   }
  }
 }
 return out;
}
export function instagramAccounts(payload){return payload?.object==='instagram'?(payload.entry||[]).map(e=>String(e.id)):[];}

// Janela do Instagram: até 24h depois da última mensagem do cliente responde normalmente;
// de 24h a 7 dias só atendente humano (tag HUMAN_AGENT); depois disso só quando o cliente escrever.
export function instagramWindow(lastInboundAt,now=Date.now()){
 if(!lastInboundAt)return {state:'closed'};const age=now-new Date(lastInboundAt).getTime();
 if(age<IG_WINDOW_MS)return {state:'open',until:new Date(new Date(lastInboundAt).getTime()+IG_WINDOW_MS).toISOString()};
 if(age<IG_HUMAN_MS)return {state:'human',until:new Date(new Date(lastInboundAt).getTime()+IG_HUMAN_MS).toISOString()};
 return {state:'closed'};
}

export class InstagramClient{
 constructor(config,fetchImpl=fetch,store=null){this.config=config;this.fetch=fetchImpl;this.store=store;}
 async lastInbound(to){if(!this.store)return null;const events=await this.store.getEvents(to);return events.filter(e=>e.direction==='in').at(-1)?.at||null;}
 async messaging(to,metadata){
  const window=instagramWindow(await this.lastInbound(to));
  if(window.state==='open')return {messaging_type:'RESPONSE'};
  if(window.state==='human'&&metadata.actor!=='ai'&&metadata.actor!=='system')return {messaging_type:'MESSAGE_TAG',tag:'HUMAN_AGENT'};
  if(window.state==='human')throw fail('No Instagram, depois de 24h sem mensagem do cliente só o atendente humano pode responder (até 7 dias).',409);
  throw fail('No Instagram só dá para responder até 7 dias depois da última mensagem do cliente. Aguarde ele escrever de novo.',409);
 }
 async call(body){
  let response;try{response=await this.fetch(igBase(this.config)+'/me/messages',{method:'POST',headers:{Authorization:'Bearer '+this.config.accessToken,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});}
  catch(cause){const e=new Error('Falha de conexão com o Instagram. O envio não pôde ser confirmado; confira antes de reenviar.');e.code=cause.cause?.code||cause.name;throw e;}
  const data=await response.json().catch(()=>({}));
  if(!response.ok){const code=data?.error?.code,sub=data?.error?.error_subcode;const why=sub===2534022||code===10?'fora da janela de resposta do Instagram':code===551||sub===2018001?'o cliente não está disponível para receber mensagens':data?.error?.message||('HTTP '+response.status);const e=new Error('Instagram API'+(code?' ('+code+')':'')+': '+why);e.code=code;throw e;}
  if(!data.message_id)throw new Error('O Instagram não retornou o identificador da mensagem. Confira o envio.');
  return {messages:[{id:data.message_id}],recipient_id:data.recipient_id};
 }
 async deliver(to,message,text,metadata,extra={}){
  const event={id:crypto.randomUUID(),phone:to,direction:'out',text,state:'sending',...metadata,...extra};
  if(this.store)await this.store.recordEvent(event);
  try{const result=await this.call({recipient:{id:to},message,...await this.messaging(to,metadata)});if(this.store)await this.store.recordEvent({...event,messageId:result.messages[0].id,state:'accepted'});return result;}
  catch(error){if(this.store)await this.store.recordEvent({...event,state:error.status===409?'failed':'uncertain',error:error.message});throw error;}
 }
 sendText(to,text,metadata={}){return this.deliver(to,{text:String(text).slice(0,1000)},text,metadata);}
 // Botões e listas do WhatsApp viram respostas rápidas do Instagram (até 13 opções, 20 caracteres).
 sendInteractive(to,text,interactive,metadata={}){
  const options=[...(interactive?.action?.buttons||[]).map(b=>b.reply||b),...(interactive?.action?.sections||[]).flatMap(s=>s.rows||[])].slice(0,13);
  const quick=options.filter(o=>o?.id&&o?.title).map(o=>({content_type:'text',title:String(o.title).slice(0,20),payload:String(o.id).slice(0,1000)}));
  const body=String(text||interactive?.body?.text||'').slice(0,1000);
  return this.deliver(to,quick.length?{text:body,quick_replies:quick}:{text:body},body,metadata,{interactive});
 }
 async sendMedia(to,kind,media,text,metadata={}){
  const url=media?.link||media?.url;if(!url)throw fail('Envio de anexos pelo Instagram precisa de um link público do arquivo.',400);
  const type={image:'image',audio:'audio',video:'video',document:'file'}[kind];if(!type)throw fail('Tipo de anexo não suportado no Instagram.');
  return this.deliver(to,{attachment:{type,payload:{url}}},text||'',metadata);
 }
 async sendTemplate(){throw fail('O Instagram não usa modelos aprovados. Só dá para responder quando o cliente escreve.',409);}
 async markRead(){return null;}
 async profile(igsid){
  const r=await this.fetch(igBase(this.config)+'/'+igsid+'?fields=name,username',{headers:{Authorization:'Bearer '+this.config.accessToken},signal:AbortSignal.timeout(8000)});
  if(!r.ok)return null;const p=await r.json();return {name:typeof p.name==='string'?p.name.slice(0,120):'',username:typeof p.username==='string'?p.username.slice(0,60):''};
 }
}

// Baixa o anexo do Instagram (link direto) e grava com a mesma rotina do WhatsApp; depois o
// receive() normal encontra o arquivo pronto e só cuida da transcrição.
export async function storeInstagramMedia(media,{fetchImpl=fetch,pool,connectionId,phone,messageId,mediaService}){
 if(!media?.url||!mediaService)return;
 const url=new URL(media.url);if(url.protocol!=='https:'||!MEDIA_HOSTS.some(h=>url.hostname===h||url.hostname.endsWith('.'+h)))throw fail('Endereço de mídia do Instagram não autorizado.',502);
 const existing=(await pool.query('SELECT * FROM media_attachments WHERE connection_id=$1 AND message_id=$2 AND meta_id=$3',[connectionId,messageId,media.id])).rows[0];if(existing?.path)return existing;
 const response=await fetchImpl(url.href,{signal:AbortSignal.timeout(60000),redirect:'follow'});if(!response.ok||!response.body)throw fail('Não foi possível baixar o arquivo do Instagram.',502);
 const mime=String(response.headers.get('content-type')||'application/octet-stream').split(';')[0],limit=LIMIT[media.kind]||LIMIT.document;
 const bytes=await mediaService.collect(Readable.fromWeb(response.body),limit);
 const row=existing||(await pool.query("INSERT INTO media_attachments(id,connection_id,phone,message_id,direction,kind,mime,name,meta_id,caption) VALUES($1,$2,$3,$4,'in',$5,$6,$7,$8,$9) RETURNING *",[crypto.randomUUID(),connectionId,phone,messageId,media.kind,mime,media.kind,media.id,media.caption||''])).rows[0];
 await pool.query('UPDATE media_attachments SET mime=$2 WHERE id=$1',[row.id,mime]);
 return mediaService.storeBytes({...row,mime},bytes);
}
