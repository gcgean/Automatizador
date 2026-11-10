import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';
import {MetaConversions,adReferral,conversionPayload} from '../server/meta-conversions.js';
import {extractMessages} from '../server/whatsapp.js';
import {createApp} from '../server/index.js';
import {requiredPermission} from '../shared/access.js';

test('extrai clique CTWA apenas do anúncio e monta evento de qualificação sem dados da conversa',()=>{
 const raw={entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'123'},messages:[{id:'in1',from:'5511999990000',timestamp:'1794310000',type:'text',text:{body:'mensagem privada'},referral:{source_type:'ad',source_id:'99',ctwa_clid:'click-123'}}]}}]}]};
 const msg=extractMessages(raw,'123')[0];assert.equal(adReferral(msg).ctwa_clid,'click-123');assert.equal(msg.timestamp,'1794310000');assert.equal(extractMessages(raw,'456').length,0);
 assert.equal(adReferral({referral:{source_type:'post',ctwa_clid:'x'}}),null);
 const payload=conversionPayload({id:'id',name:'QualifiedLead',time:1,click:'click',waba:'123'});
 assert.equal(payload.action_source,'business_messaging');assert.equal(payload.messaging_channel,'whatsapp');assert.equal(payload.user_data.ctwa_clid,'click');assert.equal(JSON.stringify(payload).includes('mensagem privada'),false);
 assert.throws(()=>conversionPayload({name:'Disqualified',click:'x',waba:'123'}));assert.throws(()=>conversionPayload({name:'Purchase',click:'x',waba:'123',value:-1}));
 assert.equal(requiredPermission('/leads/123/sales-qualification','POST'),'leads.manage');assert.equal(requiredPermission('/leads/123/meta-purchase','POST'),'deals.manage');assert.equal(requiredPermission('/meta/settings','POST'),'admin');
});

test('Meta: atribuição, classificação humana, isolamento, deduplicação e incerteza',{skip:!process.env.TEST_DATABASE_URL},async t=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');
 const admin=new Pool({connectionString:url.toString()}),schema='meta_'+crypto.randomBytes(8).toString('hex');await admin.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const store=new PgStore(url.toString(),'.');let server;
 const users={owner:{id:crypto.randomUUID(),role:'admin',name:'Admin QA',email:'admin@qa.test',connections:[]},alice:{id:crypto.randomUUID(),role:'operator',name:'Alice',email:'alice@qa.test',connections:['default']},bob:{id:crypto.randomUUID(),role:'operator',name:'Bob',email:'bob@qa.test',connections:['default']},viewer:{id:crypto.randomUUID(),role:'viewer',name:'Viewer',email:'viewer@qa.test',connections:['default']}};
 try{
  await store.init();for(const u of Object.values(users))await store.pool.query('INSERT INTO users(id,email,name,role,password_hash) VALUES($1,$2,$3,$4,$5)',[u.id,u.email,u.name,u.role,'fixture-only']);
  await store.pool.query("INSERT INTO whatsapp_connections(id,name,phone_number_id,provider) VALUES('other','Other','98765','claude')");
  const cfg={graphVersion:'v23.0',accessToken:'fixture-token',wabaId:'12345',connectionName:'Fixture'};
  let sending='ok',calls=[],datasetCreated=false;
  const registry={configFor:async()=>cfg,runtime:async id=>({store:store.scope(id),inbox:{jobs:{}}}),list:async()=>[]};
  const meta=new MetaConversions(store,registry,{fetchImpl:async(url,options={})=>{calls.push({url,body:options.body?JSON.parse(options.body):null});if(url.endsWith('/dataset')){if(options.method==='POST')datasetCreated=true;return new Response(JSON.stringify(options.method==='POST'?{id:'123456'}:{data:datasetCreated?[{id:'123456'}]:[]}));}if(sending==='network')throw new Error('network');if(sending==='reject')return new Response(JSON.stringify({error:{code:100,message:'private token secret'}}),{status:400});return new Response(JSON.stringify({events_received:1}));}});
  await meta.init();await meta.configure('default',{enabled:true},users.owner);assert.equal((await meta.settings('default')).dataset_id,'123456');
  const phone='5511999990000',otherPhone='5511999990001';await store.updateLead(phone,{nome:'Fixture',assignedUserId:users.alice.id});await store.updateLead(otherPhone,{nome:'Other'});
  const inbound=(id,click,time=100)=>({id,from:phone,timestamp:String(time),referral:{source_type:'ad',ctwa_clid:click,source_id:'9988'}});
  await meta.capture('default',inbound('new','latest',200));await meta.capture('default',inbound('old','older',100));await meta.capture('default',inbound('new','latest',200));
  assert.equal((await store.pool.query('SELECT ctwa_clid FROM meta_ad_attribution WHERE phone=$1',[phone])).rows[0].ctwa_clid,'latest');
  assert.equal((await meta.contact('other',phone)).attributed,false);
  await assert.rejects(meta.classify('default',phone,{status:'qualified'},users.bob),{status:404});
  const before=calls.length;await meta.classify('default',phone,{status:'qualified'},users.alice);await meta.classify('default',phone,{status:'qualified'},users.alice);await meta.tick();await meta.tick();assert.equal(calls.length,before+1);assert.equal((await meta.contact('default',phone)).events[0].status,'sent');
  const event=calls.at(-1).body.data[0];assert.equal(event.event_name,'QualifiedLead');assert.equal(event.user_data.ctwa_clid,'latest');assert.equal(JSON.stringify(calls.at(-1)).includes(phone),false);
  await meta.classify('default',phone,{status:'disqualified',reason:'Fora do perfil',note:'Observação privada'},users.alice);assert.equal((await store.getLead(phone)).resultado,'perdido');assert.equal(calls.length,before+1);assert.equal((await meta.contact('default',phone)).events[0].status,'sent');
  await meta.classify('default',otherPhone,{status:'qualified'},users.alice);assert.equal((await meta.contact('default',otherPhone)).events[0].status,'skipped');await meta.tick();assert.equal(calls.length,before+1);
  await meta.capture('default',{...inbound('later','later'),from:otherPhone});sending='network';await meta.classify('default',otherPhone,{status:'qualified'},users.alice);await meta.tick();assert.equal((await meta.contact('default',otherPhone)).events[0].status,'uncertain');const unknownCalls=calls.length;await meta.classify('default',otherPhone,{status:'qualified'},users.alice);await meta.tick();assert.equal(calls.length,unknownCalls);
  await store.pool.query("INSERT INTO meta_conversion_events(id,connection_id,phone,event_name,dedupe_key,event_time,status) VALUES($1,'default',$2,'Purchase','interrupted',1,'sending')",[crypto.randomUUID(),otherPhone]);await meta.init();assert.equal((await store.pool.query("SELECT status FROM meta_conversion_events WHERE dedupe_key='interrupted'")).rows[0].status,'uncertain');
  await assert.rejects(meta.purchase('default',phone,users.alice),{status:409});
  await store.pool.query("INSERT INTO crm_deals(id,connection_id,phone,client_id,remote_id,remote_status,value,state,reference) VALUES($1,'default',$2,'1','777','won',199.90,'linked','qa-purchase')",[crypto.randomUUID(),phone]);sending='ok';await meta.purchase('default',phone,users.alice);await meta.purchase('default',phone,users.alice);await meta.tick();assert.equal(calls.at(-1).body.data[0].event_name,'Purchase');assert.deepEqual(calls.at(-1).body.data[0].custom_data,{currency:'BRL',value:199.9});
  await meta.capture('default',{...inbound('third','third'),from:'5511999990002'});await store.updateLead('5511999990002',{nome:'Third'});await meta.classify('default','5511999990002',{status:'qualified'},users.alice);await meta.configure('default',{enabled:false},users.owner);const pausedCalls=calls.length;await meta.tick();assert.equal(calls.length,pausedCalls);assert.equal((await meta.contact('default','5511999990002')).events[0].status,'cancelled');
  await t.test('HTTP respeita responsável, visualizador, administrador e conexão',async()=>{
   const auth={handle:async()=>false,sameOrigin:()=>true,user:async req=>users[req.headers['x-test-user']]};
   server=http.createServer(createApp({config:{},store,registry,auth,meta,log:{error(){}}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
   const call=(path,user,body)=>fetch(base+path,{method:body?'POST':'GET',headers:{'x-test-user':user,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
   assert.equal((await call('/leads/'+phone+'/meta','bob')).status,404);assert.equal((await call('/leads/'+phone+'/meta','alice')).status,200);assert.equal((await call('/leads/'+phone+'/meta?connection=other','alice')).status,403);
   assert.equal((await call('/leads/'+otherPhone+'/sales-qualification','viewer',{status:'qualified'})).status,403);assert.equal((await call('/meta/settings','alice')).status,403);assert.equal((await call('/meta/settings','owner')).status,200);
   const visible=await (await call('/leads/'+phone+'/meta','alice')).text();assert.equal(visible.includes('latest'),false);assert.equal(visible.includes('fixture-token'),false);
  });
 }finally{if(server)await new Promise(r=>server.close(r));await store.close();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
});
