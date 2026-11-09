import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';
import {ConnectionRegistry} from '../server/connections.js';
import {loadConfig} from '../server/config.js';

test('callback de WABA: preserva webhook do app e recusa redirecionar números de fora do painel',{skip:!process.env.TEST_DATABASE_URL},async t=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');
 const admin=new Pool({connectionString:url.toString()}),schema='override_'+crypto.randomBytes(8).toString('hex');await admin.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const store=new PgStore(url.toString(),'.');
 try{
  await store.init();process.env.DEEPSEEK_API_KEY='mock-only';
  const config=loadConfig({WHATSAPP_ACCESS_TOKEN:'default-mock',WHATSAPP_APP_SECRET:'a'.repeat(32),CONNECTIONS_ENCRYPTION_KEY:'b'.repeat(64),WHATSAPP_VERIFY_TOKEN:'mock-verify',AI_PROVIDER:'deepseek'});
  const sent=[];let externalNumber=false,pagination=false,override=null;
  const fetchImpl=async(url,options)=>{const body=options.body?(options.body instanceof URLSearchParams?Object.fromEntries(options.body):JSON.parse(options.body)):null;sent.push({url,method:options.method,body});let data={success:true};
   if(url.includes('/subscriptions')&&options.method==='GET')data={data:[{object:'whatsapp_business_account',active:true,callback_url:'https://legacy.example/webhook',fields:[{name:'messages'},{name:'calls'}]}]};
   else if(url.includes('/phone_numbers?'))data={data:[{id:'99887766'},...(externalNumber?[{id:'11223344'}]:[])],...(pagination?{paging:{next:'https://graph.facebook.com/next'}}:{})};
   else if(url.endsWith('/subscribed_apps')&&options.method==='POST'){override=body?.override_callback_uri;}
   else if(url.endsWith('/subscribed_apps'))data={data:[{whatsapp_business_api_data:{id:'77889900'},override_callback_uri:override}]};
   else if(url.includes('?fields='))data={id:'99887766',display_phone_number:'+55 11 99999-0000',status:'CONNECTED',platform_type:'CLOUD_API'};
   else if(url.endsWith('/messages'))data={messages:[{id:'mock-'+crypto.randomUUID()}]};
   return {ok:true,json:async()=>data};
  };
  const registry=new ConnectionRegistry(store,config,{fetchImpl}),context=await store.saveContext(null,'Cilos QA','Você é IARA, da Cilos.');
  const connection=await registry.save({name:'Comercial Cilos',phoneNumberId:'99887766',appId:'77889900',wabaId:'44556677',contextId:context.id,provider:'deepseek',accessToken:'cilos-mock',appSecret:'c'.repeat(32),webhookMode:'waba_override'});
  await t.test('modo específico da conta é preservado ao salvar sem reenviar a opção',async()=>{const saved=await registry.save({...connection,webhookMode:undefined});assert.equal(saved.webhookMode,'waba_override');assert.equal((await registry.configFor(connection.id)).webhookMode,'waba_override');});
  await t.test('ativação altera somente a conta e confirma o override',async()=>{await registry.activate(connection.id);assert.equal(override,config.publicUrl+'/webhook');assert.equal((await store.getConnection(connection.id)).enabled,true);assert.equal(sent.filter(r=>r.method==='POST'&&r.url.endsWith('/77889900/subscriptions')).length,0);});
  await t.test('outro número na conta bloqueia o redirecionamento',async()=>{externalNumber=true;const count=sent.filter(r=>r.method==='POST').length;await assert.rejects(registry.activate(connection.id),{status:409});assert.equal(sent.filter(r=>r.method==='POST').length,count);externalNumber=false;});
  await t.test('lista paginada também exige conferência antes de redirecionar',async()=>{pagination=true;await assert.rejects(registry.activate(connection.id),{status:409});pagination=false;});
  await t.test('conexão comum continua protegida contra substituição do webhook de outro sistema',async()=>{await store.pool.query("UPDATE whatsapp_connections SET webhook_mode='app' WHERE id=$1",[connection.id]);await assert.rejects(registry.activate(connection.id),/outro webhook ativo/);});
  await t.test('falha da IA em outra marca não usa a identidade Command',async()=>{const runtime=await registry.runtime(connection.id);runtime.agent.providerFactory=()=>({name:'deepseek',complete:async()=>{throw new Error('mock failure');}});runtime.agent.log={error(){}};const result=await runtime.agent.enqueue({id:'brand-failure',from:'5511999990000',name:'QA',text:'Quero conhecer a Cilos.'});assert.match(result,/equipe comercial/);assert.doesNotMatch(result,/Command/);});
 }finally{await store.close();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
});
