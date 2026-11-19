import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {Pool} from 'pg';
import {finishReply,youtubeKey,whatsappLink,callbackPage,YOUTUBE_SCOPE} from '../server/youtube.js';
import {contactHandle} from '../shared/connections.js';
import {requiredPermission} from '../shared/access.js';

const LINK='https://wa.me/5585936181071',CHANNEL='UCcanalCommand0000000001';

test('YouTube: resposta sempre com o link do WhatsApp e sem links inventados',()=>{
 assert.equal(finishReply('Olá, Maria! Obrigado pelo interesse, veja https://golpe.example e fale com a gente.',LINK,'Maria'),'Olá, Maria! Obrigado pelo interesse, veja e fale com a gente. '+LINK);
 assert.equal(finishReply('Fale com a gente pelo WhatsApp: '+LINK+'.',LINK),'Fale com a gente pelo WhatsApp: '+LINK+'.');
 assert.match(finishReply('',LINK,'João'),/^Olá, João! .*wa\.me\/5585936181071$/);
 assert.ok(finishReply('x'.repeat(900),LINK).length<=500);
 assert.match(youtubeKey('UCabc'),/^9\d{18,19}$/);assert.equal(youtubeKey('UCabc'),youtubeKey('UCabc'));assert.notEqual(youtubeKey('UCabc'),youtubeKey('UCabd'));
 assert.equal(whatsappLink('+55 85 93618-1071'),LINK);assert.equal(whatsappLink('@loja'),'');
 assert.equal(contactHandle({telefone:'9123',youtubeHandle:'maria'},{channel:'youtube'}),'@maria');
 assert.match(callbackPage(false,'<script>x</script>'),/&lt;script&gt;/);
 assert.equal(requiredPermission('/leads/9123456789/youtube','GET'),'conversations.view');
 assert.equal(requiredPermission('/leads/9123456789/youtube/Ugx123abc/reply','POST'),'messages.send');
});

test('YouTube: conectar canal, triar comentários, aprovar e responder automático',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const {PgStore}=await import('../server/pg-store.js'),{ConnectionRegistry}=await import('../server/connections.js'),{loadConfig}=await import('../server/config.js'),{YouTubeService}=await import('../server/youtube.js');
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');const admin=new Pool({connectionString:url.toString()}),schema='yt_'+crypto.randomBytes(8).toString('hex');await admin.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const store=new PgStore(url.toString(),'.');
 try{
  await store.init();process.env.DEEPSEEK_API_KEY='test-only-key';
  const cfg=loadConfig({PAINEL_TOKEN:'qa-api-key',WHATSAPP_ACCESS_TOKEN:'server-token',WHATSAPP_APP_SECRET:'a'.repeat(32),CONNECTIONS_ENCRYPTION_KEY:'b'.repeat(64),ROTEIRO_FILE:new URL('../server/roteiro-comercial.md',import.meta.url).pathname.replace(/^\/C:/,'C:'),AI_PROVIDER:'deepseek',PUBLIC_URL:'https://comercial.example',VERIFY_TOKEN:'verify-qa'});
  const now=Date.now(),iso=ms=>new Date(ms).toISOString();
  const thread=(id,author,name,text,ago,extra={})=>({id,snippet:{videoId:'vid1',topLevelComment:{id:id+'c',snippet:{authorChannelId:{value:author},authorDisplayName:name,textOriginal:text,publishedAt:iso(now-ago)}}},...extra});
  let threads=[thread('Ugx-own',CHANNEL,'@commandsystem','Novo vídeo no ar!',60e3),thread('Ugx-maria','UCmaria00000000000000001','@maria.silva','Qual o preço do sistema para minha loja?',120e3),thread('Ugx-spam','UCspam000000000000000001','@ganhe','Ganhe dinheiro fácil, clique no meu canal',180e3),thread('Ugx-old','UCold0000000000000000001','@antigo','Quanto custa?',10*86400e3),thread('Ugx-answered','UCjose000000000000000001','@jose','Tem para MEI?',200e3,{replies:{comments:[{snippet:{authorChannelId:{value:CHANNEL}}}]}})];
  const sent=[];let replies=0;
  const fetchImpl=async(u,options={})=>{const body=options.body instanceof URLSearchParams?Object.fromEntries(options.body):options.body?JSON.parse(options.body):null;sent.push({url:u,method:options.method||'GET',body,auth:options.headers?.Authorization});
   const ok=json=>({ok:true,status:200,json:async()=>json});
   if(u==='https://oauth2.googleapis.com/token')return ok(body.grant_type==='authorization_code'?{access_token:'ya29.first',refresh_token:'1//refresh-secret',expires_in:3599,scope:YOUTUBE_SCOPE}:{access_token:'ya29.renewed',expires_in:3599});
   if(u.includes('/channels?part=snippet&mine=true'))return ok({items:[{id:CHANNEL,snippet:{title:'Command System',customUrl:'@commandsystem'}}]});
   if(u.includes('/commentThreads?'))return ok({items:threads});
   if(u.includes('/videos?'))return ok({items:[{id:'vid1',snippet:{title:'Como emitir NF-e'}}]});
   if(u.endsWith('/comments?part=snippet'))return ok({id:'reply-'+(++replies)});
   return {ok:false,status:404,json:async()=>({error:{message:'rota não simulada '+u}})};};
  const providerFactory=()=>({complete:async({messages})=>{const t=messages[0].content;return {text:/preço|orçamento/.test(t)?'{"interesse":true,"motivo":"pergunta preço","resposta":"Olá, Maria! Obrigado pelo interesse, veja https://golpe.example e fale com a gente."}':/demonstração/.test(t)?'{"interesse":true,"motivo":"pede demonstração","resposta":"Olá! Vamos marcar pelo WhatsApp."}':'{"interesse":false,"motivo":"spam","resposta":""}'};}});
  const registry=new ConnectionRegistry(store,cfg,{fetchImpl});const youtube=new YouTubeService(store,registry,{providerFactory,log:{error(){}}});registry.youtube=youtube;await registry.init();
  const context=(await store.listContexts())[0];
  await assert.rejects(registry.save({channel:'youtube',name:'YT',appId:'123456',appSecret:'GOCSPX-abc123456789',contextId:context.id,provider:'deepseek'}),/ID do cliente Google/);
  await assert.rejects(registry.save({channel:'youtube',name:'YT',appId:'123-abc.apps.googleusercontent.com',appSecret:'GOCSPX-abc123456789',contextId:context.id,provider:'deepseek',youtubeLink:'https://golpe.example'}),/wa\.me/);
  const yt=await registry.save({channel:'youtube',name:'YouTube Command',appId:' 123-abc.apps.googleusercontent.com ',appSecret:'GOCSPX-abc123456789',contextId:context.id,provider:'deepseek',youtubeLink:LINK});
  assert.equal(yt.channel,'youtube');assert.equal(yt.enabled,false);assert.match(yt.phoneNumberId,/^youtube-/);assert.equal(yt.appId,'123-abc.apps.googleusercontent.com');assert.equal(yt.youtubeLink,LINK);assert.equal(yt.youtubeAuto,false);
  await assert.rejects(registry.activate(yt.id),/Conectar com o Google/);
  // Autorização: link do Google e retorno com state assinado.
  const auth=new URL(await youtube.authorizeUrl(yt.id,'u1'));assert.equal(auth.origin+auth.pathname,'https://accounts.google.com/o/oauth2/v2/auth');
  assert.equal(auth.searchParams.get('client_id'),'123-abc.apps.googleusercontent.com');assert.equal(auth.searchParams.get('redirect_uri'),'https://comercial.example/youtube/callback');assert.equal(auth.searchParams.get('scope'),YOUTUBE_SCOPE);assert.equal(auth.searchParams.get('access_type'),'offline');
  await assert.rejects(youtube.callback(new URLSearchParams({code:'c',state:auth.searchParams.get('state')+'x'})),/inválido ou expirado/);
  const done=await youtube.callback(new URLSearchParams({code:'auth-code',state:auth.searchParams.get('state')}));assert.equal(done.channelTitle,'Command System');
  const exchange=sent.find(s=>s.body?.grant_type==='authorization_code');assert.equal(exchange.body.redirect_uri,'https://comercial.example/youtube/callback');assert.equal(exchange.body.client_secret,'GOCSPX-abc123456789');
  let connection=(await registry.list()).find(c=>c.id===yt.id);assert.equal(connection.enabled,true);assert.equal(connection.phoneNumberId,CHANNEL);assert.equal(connection.displayPhone,'@commandsystem');
  assert.ok(!JSON.stringify(await registry.list()).includes('1//refresh-secret'),'token não aparece na lista');
  assert.equal((await registry.configFor(yt.id)).accessToken,'1//refresh-secret');
  // Re-salvar a conexão mantém o canal.
  await registry.save({...connection,appSecret:'',youtubeLink:LINK,youtubeAuto:false});assert.equal((await registry.list()).find(c=>c.id===yt.id).phoneNumberId,CHANNEL);
  // Leitura: só o interessado vira atendimento.
  await youtube.poll(yt.id);await registry.drain();
  const {rows}=await store.pool.query('SELECT thread_id,status FROM youtube_comments WHERE connection_id=$1 ORDER BY thread_id',[yt.id]);
  assert.deepEqual(rows.map(r=>[r.thread_id,r.status]),[['Ugx-answered','answered_elsewhere'],['Ugx-maria','pending'],['Ugx-spam','ignored']]);
  const runtime=await registry.runtime(yt.id),maria=youtubeKey('UCmaria00000000000000001');
  const leads=await runtime.store.listLeads();assert.deepEqual(Object.keys(leads),[maria]);
  assert.equal(leads[maria].nomeWhatsApp,'maria.silva');assert.equal(leads[maria].youtubeHandle,'maria.silva');assert.equal(leads[maria].status,'encaminhado');
  const inbound=(await runtime.store.getEvents(maria)).filter(e=>e.direction==='in');assert.equal(inbound.length,1);assert.match(inbound[0].text,/Comentário no vídeo "Como emitir NF-e"\] Qual o preço/);
  let pending=await youtube.pending(yt.id,maria);assert.equal(pending.items.length,1);assert.equal(pending.items[0].videoUrl,'https://www.youtube.com/watch?v=vid1');
  assert.equal(pending.items[0].suggestion,'Olá, Maria! Obrigado pelo interesse, veja e fale com a gente. '+LINK);
  assert.equal(sent.filter(s=>s.url.endsWith('/comments?part=snippet')).length,0,'nada publicado sem aprovação');
  // Segunda leitura não repete comentários.
  await youtube.poll(yt.id);await registry.drain();assert.equal((await runtime.store.getEvents(maria)).filter(e=>e.direction==='in').length,1);
  // Aprovação: publica como resposta ao comentário.
  await assert.rejects(youtube.reply(yt.id,maria,'Ugx-spam','oi',null),/não encontrado/);
  pending=await youtube.reply(yt.id,maria,'Ugx-maria','Olá, Maria! Chama a gente no WhatsApp: '+LINK,{id:'u1',name:'Gean'});
  assert.equal(pending.items.length,0);
  const post=sent.filter(s=>s.url.endsWith('/comments?part=snippet')).at(-1);assert.deepEqual(post.body,{snippet:{parentId:'Ugx-maria',textOriginal:'Olá, Maria! Chama a gente no WhatsApp: '+LINK}});assert.equal(post.auth,'Bearer ya29.first');
  const out=(await runtime.store.getEvents(maria)).filter(e=>e.direction==='out');assert.equal(out.at(-1).state,'accepted');assert.equal(out.at(-1).actor,'human');assert.equal(out.at(-1).messageId,'reply-1');
  await assert.rejects(youtube.reply(yt.id,maria,'Ugx-maria','de novo',null),/já foi respondido/);
  // Resposta pelo campo de mensagem da conversa vai para o comentário mais recente do contato.
  await runtime.agent.whatsapp.sendText(maria,'Qualquer dúvida estamos aqui.',{actor:'human'});
  assert.equal(sent.filter(s=>s.url.endsWith('/comments?part=snippet')).at(-1).body.snippet.parentId,'Ugx-maria');
  await assert.rejects(runtime.agent.whatsapp.sendText('9000000000000000001','oi',{actor:'human'}),/Não há comentário/);
  // Modo automático: publica a sugestão assim que o comentário entra.
  await registry.save({...(await registry.list()).find(c=>c.id===yt.id),appSecret:'',youtubeLink:LINK,youtubeAuto:true});
  threads=[thread('Ugx-ana','UCana000000000000000000001','Ana Paula','Quero uma demonstração',30e3),...threads];
  await youtube.poll(yt.id);await registry.drain();
  const ana=youtubeKey('UCana000000000000000000001'),auto=sent.filter(s=>s.url.endsWith('/comments?part=snippet')).at(-1);
  assert.equal(auto.body.snippet.parentId,'Ugx-ana');assert.equal(auto.body.snippet.textOriginal,'Olá! Vamos marcar pelo WhatsApp. '+LINK);
  assert.equal((await runtime.store.getEvents(ana)).filter(e=>e.direction==='out').at(-1).actor,'ai');
  assert.equal((await youtube.pending(yt.id,ana)).items.length,0);
  // Token revogado: erro claro, sem 502.
  youtube.tokens.clear();const revoked=new YouTubeService(store,registry,{fetchImpl:async()=>({ok:false,status:400,json:async()=>({error:'invalid_grant'})}),providerFactory,log:{error(){}}});
  await assert.rejects(revoked.poll(yt.id),e=>e.status===424&&/Conecte a conta Google de novo/.test(e.message));
  // Outros módulos recusam o YouTube.
  const {Contacts}=await import('../server/contacts.js');await assert.rejects(new Contacts(store).save(yt.id,{phone:'88999990001',name:'X'},{id:crypto.randomUUID()}),/YouTube/);
 }finally{await store.close();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
});
