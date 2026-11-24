import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';
import {CommercialGrowth,immediateSalesIntent,verifyProductSignature} from '../server/commercial-growth.js';
import {PRODUCT_SEEDS,chooseProduct,validateProduct,safeProductUrl} from '../server/commercial-products.js';
import {requestsOptOut} from '../server/consent.js';
import {interestTags} from '../server/interest-tags.js';
import {ConsultantRouting,defaultHours} from '../server/consultant-routing.js';
import http from 'node:http';
import {createApp} from '../server/index.js';
import {completeCadences} from '../server/cadence-completion.js';

test('recusa de acompanhamento, intenção imediata e classificação sem inferir interesse',()=>{
 for(const s of ['Não quero receber acompanhamento, vou bloquear','Não entre em contato','Não quero acompanhamento','Não me ligue mais'])assert.equal(requestsOptOut(s),true,s);
 for(const s of ['Pode ligar agora','Estou disponível','Quero contratar','quero falar com um vendedor'])assert.equal(immediateSalesIntent(s),true,s);
 for(const s of ['Não pode ligar agora','Estou disponível amanhã','Quero saber mais','Ela perguntou se pode ligar'])assert.equal(immediateSalesIntent(s),false,s);
 assert.deepEqual(interestTags('Não preciso de oficina, quero Cilos CRM').map(t=>t.name),['Cilos CRM']);
 assert.equal(chooseProduct(PRODUCT_SEEDS,{produtos_interesse:'NFS-e'},[]).id,'nfse');
 assert.equal(chooseProduct(PRODUCT_SEEDS,{produtos_interesse:'contador e NFS-e'},[]).id,'contador');
 assert.equal(chooseProduct(PRODUCT_SEEDS,{},[]),null);
 assert.equal(chooseProduct(PRODUCT_SEEDS,{segmento:'Oficina mecânica',produtos_interesse:'estoque'},[]).id,'oficina');
 assert.equal(chooseProduct(PRODUCT_SEEDS,{produtos_interesse:'oficina e NF-e'},[]).id,'oficina');
 assert.throws(()=>safeProductUrl('https://127.0.0.1/'));
 assert.throws(()=>validateProduct({id:'teste',name:'Teste',tags:[],trialConfirmed:true}));
});
test('assinatura de eventos rejeita replay antigo e alteração de corpo',()=>{
 const raw=Buffer.from('{"eventId":"a"}'),secret='synthetic',timestamp='1795435200',signature='sha256='+crypto.createHmac('sha256',secret).update(timestamp+'.').update(raw).digest('hex');
 assert.equal(verifyProductSignature(raw,secret,timestamp,signature,Number(timestamp)*1000),true);
 assert.equal(verifyProductSignature(Buffer.from('{}'),secret,timestamp,signature,Number(timestamp)*1000),false);
 assert.equal(verifyProductSignature(raw,secret,timestamp,signature,Number(timestamp)*1000+301000),false);
});
test('catálogo, eventos idempotentes, isolamento, prioridade, concorrência e Telegram simulado',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');const db=new Pool({connectionString:url.toString()}),schema='growth_'+crypto.randomBytes(8).toString('hex');await db.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const root=new PgStore(url.toString(),'.');
 try{
  await root.init();const now=new Date('2026-11-23T14:00:00Z'),config={publicUrl:'https://sales.example.com',connectionsKey:'b'.repeat(64)},sent=[];
  const growth=new CommercialGrowth(root,config,{now:()=>now,fetchImpl:async(u,o)=>{sent.push(JSON.parse(o.body));return {ok:true,json:async()=>({ok:true})};}}),routing=new ConsultantRouting(root,{now:()=>now});
  const store=root.scope('default'),userId=crypto.randomUUID(),admin={id:userId,company_id:'default',role:'admin',name:'Gestor',connections:['default']};
  await root.pool.query("UPDATE whatsapp_connections SET enabled=true WHERE id='default'");
  await root.pool.query("INSERT INTO users(id,email,name,role,password_hash,company_id,accepts_ai_handoff,handoff_available,handoff_last_seen,handoff_presence_company) VALUES($1,'growth@qa.test','Gestor','admin','synthetic','default',true,true,$2,'default')",[userId,now]);
  await root.pool.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1::text,$1::uuid,now()+interval '1 day')",[userId]);
  const hours=defaultHours();hours.enabled=true;hours.days[1]=[{start:'08:00',end:'18:00'}];await routing.save(admin,hours);
  await growth.init();growth.bind({routing,runtime:async()=>({agent:{store}})});
  const product=await growth.saveProduct('default',{id:'test',name:'Teste',tags:['Cilos Frotas'],trialUrl:'https://product.example.com/signup',trialConfirmed:true,conditions:'7 dias',templateName:'trial_test'},admin);
  const phone='5511999900111';await store.updateLead(phone,{nome:'Sintético',temperatura:'morno',produtos_interesse:'Cilos Frotas'});
  const targeted=await growth.cadenceTemplate('default',phone,[{name:'trial_test',language:'pt_BR',body:'Conheça o teste: {{1}}'}],[]);assert.equal(targeted.payload.components[0].parameters[0].type,'text');assert.ok(targeted.body.includes('/t/'));
  assert.equal(await growth.cadenceTemplate('default',phone,[{name:'trial_test',language:'pt_BR',body:'Conheça o teste: {{1}}'}],[{direction:'out',text:targeted.body}]),null);
  const link=await growth.makeLink('default',phone,product);assert.ok(link.url.includes('/t/'));const destination=await growth.redirect(link.token);assert.equal(new URL(destination).searchParams.get('commercial_ref'),link.token);
  const page=await growth.publicPage('default','test');assert.ok(page.includes('Começar teste'));assert.ok(!page.includes(phone));
  const auth={handle:async()=>false,user:async req=>req.headers.authorization==='synthetic'?admin:null,sameOrigin:()=>true};
  const server=http.createServer(createApp({config,store:root,auth,registry:{growth,config,routing}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));
  try{const base='http://127.0.0.1:'+server.address().port;assert.equal((await fetch(base+'/commercial/catalog')).status,401);assert.equal((await fetch(base+'/commercial/catalog',{headers:{authorization:'synthetic'}})).status,200);assert.equal((await fetch(base+'/conhecer/default/test')).status,200);assert.equal((await fetch(base+'/product-events/default/test',{method:'POST',body:'{}'})).status,401);}finally{await new Promise(r=>server.close(r));}
  const integration=await growth.rotateIntegration('default','test',admin),timestamp=String(now.getTime()/1000);
  const send=async body=>{const raw=Buffer.from(JSON.stringify(body));return growth.receiveEvent('default','test',raw,{'x-commercial-timestamp':timestamp,'x-commercial-signature':'sha256='+crypto.createHmac('sha256',integration.secret).update(timestamp+'.').update(raw).digest('hex')});};
  const event={eventId:'signup-1',accountId:'account-1',ref:link.token,kind:'signup_completed',occurredAt:now.toISOString()};
  assert.equal((await send(event)).duplicate,false);assert.equal((await send(event)).duplicate,true);
  assert.equal(await growth.cadenceTemplate('default',phone,[{name:'trial_test',language:'pt_BR',body:'Conheça: {{1}}'}],[]),null);
  await send({...event,eventId:'activated',kind:'activation_completed',ref:undefined});assert.equal((await growth.summary('default',phone))[0].stage,'Ativou');
  await assert.rejects(send({...event,kind:'first_login'}),/Identificador de evento/);
  await root.pool.query("INSERT INTO cadence_settings(connection_id,enabled,max_attempts,template_name) VALUES('default',true,1,'synthetic')");
  await root.pool.query("INSERT INTO cadence_queue(connection_id,phone,cycle_id,inbound_id,question,status,attempts,next_at,preferred_time) VALUES('default',$1,$2,'synthetic','Pergunta','awaiting_response',1,$3,'10:00')",[phone,crypto.randomUUID(),new Date(now.getTime()-1000)]);
  await completeCadences({store:root,registry:{growth,runtime:async()=>({inbox:{jobs:{}}})},now:()=>now,allowed:()=>true});assert.equal((await root.pool.query('SELECT status FROM cadence_queue WHERE phone=$1',[phone])).rows[0].status,'stopped');assert.notEqual((await store.getLead(phone)).conversationClosed,true);
  await store.updateLead(phone,{conversationClosed:true,conversationClosedReason:'cadence_no_response'});await send({...event,eventId:'error-after-cadence',kind:'usage_error'});assert.equal((await store.getLead(phone)).conversationClosed,false);
  await store.updateLead(phone,{conversationClosed:true,conversationClosedReason:'manual'});await send({...event,eventId:'error-after-manual',kind:'usage_error'});assert.equal((await store.getLead(phone)).conversationClosed,true);await store.updateLead(phone,{conversationClosed:false});
  await assert.rejects(growth.saveProduct('default',{...product,name:'Conflito',version:0},admin),/alterado/);
  await assert.rejects(growth.assertConnection({...admin,company_id:'other'},'default'),/indisponível/);
  const agent={store};await growth.requestHuman(agent,phone,'Pode ligar');assert.equal((await store.getLead(phone)).assignedUserId,userId);
  const otherId=crypto.randomUUID();await root.pool.query("INSERT INTO users(id,email,name,role,password_hash,company_id) VALUES($1,'other@qa.test','Outro','admin','synthetic','default')",[otherId]);
  await assert.rejects(growth.assume('default',phone,{...admin,id:otherId}),/Outro vendedor/);
  await growth.assume('default',phone,admin);await growth.humanReply('default',phone);assert.equal((await root.pool.query('SELECT status FROM commercial_requests WHERE phone=$1',[phone])).rows[0].status,'responded');
  await growth.saveTelegram(admin,{enabled:true,token:'123456:'+('a'.repeat(35)),userId,chatId:'12345678',manager:true});await growth.telegramTick();const count=sent.length;assert.ok(count>0);await growth.telegramTick();assert.equal(sent.length,count);assert.ok(sent.every(m=>!JSON.stringify(m).includes(phone)));
  await store.updateLead(phone,{optedOut:true});assert.equal(await growth.makeLink('default',phone,product),null);
 }finally{await root.close();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();}
});
