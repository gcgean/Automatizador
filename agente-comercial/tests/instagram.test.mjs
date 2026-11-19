import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {Pool} from 'pg';
import {extractInstagram,instagramWindow,InstagramClient,igBase} from '../server/instagram.js';
import {contactHandle} from '../shared/connections.js';

const ACCOUNT='17841400000000001',CLIENT='5550000000000001';
const event=(message,extra={})=>({sender:{id:CLIENT},recipient:{id:ACCOUNT},timestamp:1763460000000,...(message?{message}:{}),...extra});
const payload=(...messaging)=>({object:'instagram',entry:[{id:ACCOUNT,time:1763460000,messaging}]});

test('Instagram: leitura do webhook no formato da caixa de entrada',()=>{
 const out=extractInstagram(payload(
  event({mid:'m1',text:'Quanto custa?'}),
  event({mid:'m2',text:'Lindo!',reply_to:{story:{id:'s1',url:'https://lookaside.fbsbx.com/x'}}}),
  event({mid:'m3',attachments:[{type:'image',payload:{url:'https://lookaside.fbsbx.com/ig_messaging_cdn/?asset_id=1'}}]}),
  event({mid:'m4',text:'Sim',quick_reply:{payload:'slot-10'}}),
  event({mid:'m5',text:'eco',is_echo:true}),
  event(null,{reaction:{mid:'m1',action:'react',emoji:'😍'}}),
  event({mid:'m6',attachments:[{type:'story_mention',payload:{url:'https://lookaside.fbsbx.com/y'}}]}),
 ),ACCOUNT);
 assert.deepEqual(out.map(m=>[m.id.slice(0,13),m.from,m.type,m.text]),[
  ['m1',CLIENT,'text','Quanto custa?'],['m2',CLIENT,'text','[Resposta ao seu story] Lindo!'],['m3',CLIENT,'image',''],['m4',CLIENT,'text','Sim'],
  ['ig-reaction-m',CLIENT,'reaction','[O cliente reagiu com 😍 a uma mensagem.]'],['m6',CLIENT,'text','[O cliente mencionou a empresa em um story.]']]);
 assert.equal(out[2].media.kind,'image');assert.match(out[2].media.url,/fbsbx/);assert.match(out[2].media.id,/^ig-[0-9a-f]{32}$/);
 assert.equal(out[3].interactiveReplyId,'slot-10');assert.equal(out[0].timestamp,1763460000);
 assert.deepEqual(extractInstagram(payload(event({mid:'x',text:'oi'})),'999'),[],'outra conta');
 assert.deepEqual(extractInstagram({object:'whatsapp_business_account',entry:[]},ACCOUNT),[]);
 assert.equal(contactHandle({telefone:CLIENT,instagramUsername:'cliente.ig'},{channel:'instagram'}),'@cliente.ig');
 assert.equal(contactHandle({telefone:'5588999990001'},{channel:'whatsapp'}),'+5588999990001');
});

test('Instagram: janela de 24h, atendente humano até 7 dias e envio',async()=>{
 const now=Date.now(),h=3600e3;
 assert.equal(instagramWindow(new Date(now-2*h).toISOString(),now).state,'open');
 assert.equal(instagramWindow(new Date(now-30*h).toISOString(),now).state,'human');
 assert.equal(instagramWindow(new Date(now-8*24*h).toISOString(),now).state,'closed');
 assert.equal(instagramWindow(null).state,'closed');
 assert.equal(igBase({accessToken:'IGAAx',graphVersion:'v21.0'}),'https://graph.instagram.com/v21.0');
 assert.equal(igBase({accessToken:'EAAx',graphVersion:'v21.0'}),'https://graph.facebook.com/v21.0');
 let lastIn=new Date(now-2*h).toISOString();const calls=[],events=[];
 const store={getEvents:async()=>[{direction:'in',at:lastIn}],recordEvent:async e=>{events.push(e);}};
 const fetchImpl=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return {ok:true,json:async()=>({recipient_id:CLIENT,message_id:'mid-'+calls.length})};};
 const client=new InstagramClient({accessToken:'IGAAtoken',graphVersion:'v21.0'},fetchImpl,store);
 const r=await client.sendText(CLIENT,'Olá!',{actor:'ai'});
 assert.equal(r.messages[0].id,'mid-1');assert.equal(calls[0].url,'https://graph.instagram.com/v21.0/me/messages');
 assert.deepEqual(calls[0].body,{recipient:{id:CLIENT},message:{text:'Olá!'},messaging_type:'RESPONSE'});
 assert.deepEqual(events.map(e=>e.state),['sending','accepted']);
 await client.sendInteractive(CLIENT,'Escolha um horário',{type:'button',body:{text:'Escolha'},action:{buttons:[{type:'reply',reply:{id:'a',title:'Segunda 10h'}},{type:'reply',reply:{id:'b',title:'Terça 15h com nome muito longo'}}]}},{actor:'ai'});
 assert.deepEqual(calls[1].body.message.quick_replies,[{content_type:'text',title:'Segunda 10h',payload:'a'},{content_type:'text',title:'Terça 15h com nome m',payload:'b'}]);
 lastIn=new Date(now-30*h).toISOString();
 await client.sendText(CLIENT,'Oi, aqui é da equipe',{actor:'human'});
 assert.equal(calls[2].body.messaging_type,'MESSAGE_TAG');assert.equal(calls[2].body.tag,'HUMAN_AGENT');
 await assert.rejects(client.sendText(CLIENT,'IA fora da janela',{actor:'ai'}),/só o atendente humano/);
 lastIn=new Date(now-8*24*h).toISOString();
 await assert.rejects(client.sendText(CLIENT,'Muito tarde',{actor:'human'}),/7 dias/);
 assert.equal(calls.length,3,'nada enviado fora da janela');
 await assert.rejects(client.sendTemplate(),/não usa modelos/);
 const failing=new InstagramClient({accessToken:'IGAAtoken'},async()=>({ok:false,status:400,json:async()=>({error:{code:551,message:'x'}})}),{getEvents:async()=>[{direction:'in',at:new Date().toISOString()}],recordEvent:async()=>{}});
 await assert.rejects(failing.sendText(CLIENT,'oi',{}),/não está disponível/);
});

test('Instagram: cadastro, ativação e recebimento numa conexão real',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const {PgStore}=await import('../server/pg-store.js'),{ConnectionRegistry}=await import('../server/connections.js'),{loadConfig}=await import('../server/config.js'),{Contacts}=await import('../server/contacts.js');
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');const admin=new Pool({connectionString:url.toString()}),schema='insta_'+crypto.randomBytes(8).toString('hex');await admin.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const store=new PgStore(url.toString(),'.');
 try{
  await store.init();process.env.DEEPSEEK_API_KEY='test-only-key';
  const cfg=loadConfig({PAINEL_TOKEN:'qa-api-key',WHATSAPP_ACCESS_TOKEN:'server-token',WHATSAPP_APP_SECRET:'a'.repeat(32),CONNECTIONS_ENCRYPTION_KEY:'b'.repeat(64),ROTEIRO_FILE:new URL('../server/roteiro-comercial.md',import.meta.url).pathname.replace(/^\/C:/,'C:'),AI_PROVIDER:'deepseek',PUBLIC_URL:'https://comercial.example',VERIFY_TOKEN:'verify-qa'});
  const sent=[];
  const fetchImpl=async(u,options={})=>{const body=options.body?(options.body instanceof URLSearchParams?Object.fromEntries(options.body):JSON.parse(options.body)):null;sent.push({url:u,method:options.method||'GET',body});
   const json=u.includes('/me?fields=user_id,username')?{user_id:ACCOUNT,username:'lojaqa'}:u.includes('/subscriptions')&&!body?{data:[]}:u.includes('/'+CLIENT+'?fields=name,username')?{name:'Cliente IG',username:'cliente.ig'}:u.endsWith('/me/messages')?{recipient_id:CLIENT,message_id:'mid-x'}:{success:true};
   return {ok:true,status:200,json:async()=>json};};
  const registry=new ConnectionRegistry(store,cfg,{fetchImpl});await registry.init();
  const context=(await store.listContexts())[0];
  const ig=await registry.save({channel:'instagram',name:'Instagram Loja',phoneNumberId:ACCOUNT,appId:'123456',accessToken:'IGAAsecret-token',appSecret:'d'.repeat(32),contextId:context.id,provider:'deepseek'});
  assert.equal(ig.channel,'instagram');assert.equal(ig.enabled,false);assert.ok(!JSON.stringify(await registry.list()).includes('IGAAsecret-token'));
  await assert.rejects(registry.save({...ig,channel:'whatsapp',accessToken:'',appSecret:''}),/canal/);
  const active=await registry.activate(ig.id);assert.equal(active.enabled,true);assert.equal(active.displayPhone,'@lojaqa');
  const appSub=sent.find(s=>s.url.endsWith('/123456/subscriptions')&&s.body);assert.equal(appSub.body.object,'instagram');assert.equal(appSub.body.callback_url,'https://comercial.example/webhook');assert.match(appSub.body.fields,/messages/);
  assert.ok(sent.some(s=>s.url==='https://graph.instagram.com/'+cfg.graphVersion+'/me/subscribed_apps'&&s.body?.subscribed_fields));
  // Token de outra conta é recusado na ativação.
  const other=await registry.save({channel:'instagram',name:'Outra',phoneNumberId:'17841499999999999',appId:'123456',accessToken:'IGAAother',appSecret:'d'.repeat(32),contextId:context.id,provider:'deepseek'});
  await assert.rejects(registry.activate(other.id),/outro ID/);
  // Recebimento: assinatura do app, perfil do cliente e mensagem na caixa de entrada.
  const runtime=await registry.runtime(ig.id),received=[];runtime.inbox.agent={enqueue:async m=>{received.push(m);return null;}};
  const body=payload(event({mid:'m-real',text:'Oi, quero saber o preço'}));const raw=Buffer.from(JSON.stringify(body));
  const signature='sha256='+crypto.createHmac('sha256','d'.repeat(32)).update(raw).digest('hex');
  await assert.rejects(registry.receive(body,raw,'sha256='+'0'.repeat(64)),/invalid signature/);
  await registry.receive(body,raw,signature);await registry.drain();
  assert.equal(received.length,1);assert.equal(received[0].from,CLIENT);assert.equal(received[0].text,'Oi, quero saber o preço');assert.equal(received[0].name,'Cliente IG');
  const lead=await runtime.store.getLead(CLIENT);assert.equal(lead.instagramUsername,'cliente.ig');assert.equal(lead.nomeWhatsApp,'Cliente IG');
  // Envio pelo runtime da conexão usa o Instagram.
  await runtime.store.recordEvent({id:'in-1',phone:CLIENT,direction:'in',actor:'client',text:'oi',at:new Date().toISOString()});
  await runtime.agent.whatsapp.sendText(CLIENT,'Olá! Posso ajudar.',{actor:'ai'});
  const out=sent.filter(s=>s.url.endsWith('/me/messages')).at(-1);assert.deepEqual(out.body.recipient,{id:CLIENT});assert.equal(out.body.messaging_type,'RESPONSE');
  // Contatos: no Instagram não dá para cadastrar nem importar.
  const contacts=new Contacts(store);await assert.rejects(contacts.save(ig.id,{phone:'88999990001',name:'X'},{id:crypto.randomUUID()}),/Instagram/);
  const listed=await contacts.list(null,await registry.list(),{connectionId:ig.id});assert.equal(listed.items[0].channel,'instagram');assert.equal(listed.items[0].instagramUsername,'cliente.ig');
 }finally{await store.close();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
});
