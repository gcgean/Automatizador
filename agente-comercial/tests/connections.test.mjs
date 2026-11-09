import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';
import {ConnectionRegistry} from '../server/connections.js';
import {LearningService} from '../server/learning.js';
import {loadConfig} from '../server/config.js';
import {createApp} from '../server/index.js';
import http from 'node:http';
const database=process.env.TEST_DATABASE_URL;
test('múltiplos números: isolamento de histórico, contexto, fila, credenciais e aprendizado', {skip:!database},async()=>{
 const url=new URL(database);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');const admin=new Pool({connectionString:database}),schema='multi_'+crypto.randomBytes(8).toString('hex');await admin.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const store=new PgStore(url.toString(),'.');let server;
 try{
  await store.init();
  const cfg=loadConfig({PAINEL_TOKEN:'qa-api-key',WHATSAPP_ACCESS_TOKEN:'server-token',WHATSAPP_APP_SECRET:'a'.repeat(32),CONNECTIONS_ENCRYPTION_KEY:'b'.repeat(64),ROTEIRO_FILE:new URL('../server/roteiro-comercial.md',import.meta.url).pathname.replace(/^\/C:/,'C:'),AI_PROVIDER:'deepseek'});
  const sent=[];
  process.env.DEEPSEEK_API_KEY='test-only-key';let otherWebhook=false;
  const fetchImpl=async(url,options)=>{const body=options.body?(options.body instanceof URLSearchParams?Object.fromEntries(options.body):JSON.parse(options.body)):{};sent.push({url,body});return {ok:true,json:async()=>url.includes('/subscriptions')&&options.method==='GET'?{data:otherWebhook?[{object:'whatsapp_business_account',active:true,callback_url:'https://other.example/webhook'}]:[]}:url.includes('?fields=')?{id:'99887766',display_phone_number:'+55 21 99999-0000',status:'CONNECTED',platform_type:'CLOUD_API'}:url.endsWith('/messages')?{messages:[{id:'send-'+crypto.randomUUID()}]}:{success:true}};};
  const registry=new ConnectionRegistry(store,cfg,{fetchImpl});await registry.init();
  const first=await store.getConnection();await store.saveContext(first.contextId,'Produto A','Você atende somente o produto A.');
  const contextB=await store.saveContext(null,'Produto B','Você atende somente o produto B.');
  const b=await registry.save({name:'Número B',phoneNumberId:'99887766',contextId:contextB.id,provider:'deepseek',accessToken:'private-token-B',appSecret:'c'.repeat(32)});
  await store.pool.query('UPDATE whatsapp_connections SET enabled=true WHERE id=$1',[b.id]);
  const list=JSON.stringify(await registry.list());assert.ok(!list.includes('private-token-B'));assert.ok(!list.includes('c'.repeat(32)));assert.ok(!(await store.pool.query('SELECT access_token_cipher FROM whatsapp_connections WHERE id=$1',[b.id])).rows[0].access_token_cipher.includes('private-token-B'));
  const aRuntime=await registry.runtime('default'),bRuntime=await registry.runtime(b.id);
  for(const [runtime,expected] of [[aRuntime,'produto A'],[bRuntime,'produto B']])runtime.agent.providerFactory=()=>({name:'deepseek',complete:async({system})=>{assert.ok(system.includes(expected));return {append:[{role:'assistant',content:expected}],text:expected,toolCalls:[]};}});
  const payload=id=>({entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:id},messages:[{id:'same-message-id',from:'5511999990000',type:'text',text:{body:'Olá'}}]}}]}]});
  for(const [id,secret] of [[cfg.phoneNumberId,'a'.repeat(32)],['99887766','c'.repeat(32)]]){const value=payload(id),raw=Buffer.from(JSON.stringify(value)),signature='sha256='+crypto.createHmac('sha256',secret).update(raw).digest('hex');await registry.receive(value,raw,signature);await registry.receive(value,raw,signature);}
  await registry.drain();
  assert.equal((await aRuntime.store.getEvents('5511999990000')).length,2);assert.equal((await bRuntime.store.getEvents('5511999990000')).length,2);
  assert.equal((await aRuntime.store.getEvents('5511999990000'))[1].text,'produto A');assert.equal((await bRuntime.store.getEvents('5511999990000'))[1].text,'produto B');
  await aRuntime.store.updateLead('5511999990000',{temperatura:'quente',optedOut:true});assert.equal((await bRuntime.store.listLeads())['5511999990000']?.optedOut,undefined);
  const wrong=payload('99887766');await assert.rejects(registry.receive(wrong,Buffer.from(JSON.stringify(wrong)),'sha256='+'0'.repeat(64)),/signature/);
  let analyses=0;const learning=new LearningService(store,registry,{providerFactory:()=>({complete:async()=>{analyses++;return {toolCalls:[{name:'propor_melhoria',input:{summary:'Exemplo sintético de análise.',suggestion:'Faça uma pergunta objetiva sobre a necessidade principal.',limitations:'A amostra não demonstra causalidade.'}}],text:''};}})});
  assert.equal((await learning.analyze(b.id)).insufficient,true);assert.equal(analyses,0);
  for(let n=0;n<10;n++){const phone='5521999900'+String(n).padStart(2,'0');await bRuntime.store.updateLead(phone,{nome:'QA',resultado:n===0?'ganho':'aberto'});for(let i=0;i<3;i++)await bRuntime.store.recordEvent({id:'out-'+n+'-'+i,phone,direction:'out',actor:'ai',text:'Teste de conversa',at:new Date(Date.now()-72*3600000+n*10000+i*1000).toISOString()});await bRuntime.store.recordEvent({id:'in-'+n,phone,direction:'in',text:'Tenho interesse',at:new Date(Date.now()-71*3600000+n*10000).toISOString()});}
  const proposed=await learning.analyze(b.id);assert.ok(proposed.id);assert.equal(analyses,1);
  const before=(await store.getConnection('default')).contextBody;
  await learning.decide(b.id,proposed.id,'apply',null);const applied=await store.getConnection(b.id);assert.notEqual(applied.contextId,contextB.id);assert.match(applied.contextBody,/pergunta objetiva/);assert.equal((await store.getConnection('default')).contextBody,before);
  await learning.decide(b.id,proposed.id,'undo',null);assert.equal((await store.getConnection(b.id)).contextId,contextB.id);
  const second=await learning.analyze(b.id);await store.saveContext(contextB.id,'Produto B','Contexto editado depois da análise.');await assert.rejects(learning.decide(b.id,second.id,'apply',null),/mudou/);
  server=http.createServer(createApp({config:cfg,store,registry,learning,log:{error(){}}}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const root='http://127.0.0.1:'+server.address().port;const headers={Authorization:'Bearer qa-api-key'};
  const found=await fetch(root+'/conversations/5511999990000?connection='+b.id,{headers});assert.equal(found.status,200);assert.ok(!(await found.text()).includes('produto A'));
  assert.equal((await fetch(root+'/leads?connection=not-found',{headers})).status,404);
  const report=await fetch(root+'/reports?from=2026-01-01&to=2026-12-31&connection=default',{headers});assert.equal((await report.json()).messages.sent,1);
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await store.close();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
});
