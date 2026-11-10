import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {deliveryActivity} from '../shared/delivery.js';
import {WhatsAppClient} from '../server/whatsapp.js';
import {DurableInbox} from '../server/inbox.js';
import {Store} from '../server/store.js';
import {createApp} from '../server/index.js';
import {loadConfig} from '../server/config.js';

test('atividade distingue envio manual, IA e bloqueio por confirmação pendente',()=>{
 const phone='5511999990000',job=(status,manual)=>({status,message:{id:crypto.randomUUID(),from:phone,manual}});
 assert.equal(deliveryActivity({one:job('processing',true)},phone).label,'Enviando sua mensagem…');
 assert.equal(deliveryActivity({one:job('processing',false)},phone).label,'IARA está respondendo…');
 const state=deliveryActivity({one:job('attention',true),two:job('queued',true)},phone);
 assert.equal(state.phase,'attention');assert.equal(state.queued.length,1);
 assert.equal(deliveryActivity({one:job('done',true)},phone).phase,'idle');
});

test('falha de conexão preserva resultado incerto sem repetir a mensagem',async()=>{
 const events=[];let requests=0;
 const whatsapp=new WhatsAppClient({accessToken:'test-only',phoneNumberId:'123456',graphVersion:'v23.0'},async()=>{requests++;throw new Error('fetch failed',{cause:{code:'UND_ERR_CONNECT_TIMEOUT'}});},{recordEvent:async event=>events.push(event)});
 await assert.rejects(whatsapp.sendText('5511999990000','Mensagem de teste'),/Falha de conexão com a Meta/);
 assert.equal(requests,1);assert.equal(events.at(-1).state,'uncertain');assert.match(events.at(-1).error,/recebimento/);
});

test('cancelamento pendente vence a captura da fila sem enviar a mensagem cancelada',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'cancel-race-')),store=new Store(dir),sent=[];
 try{await store.init();const inbox=new DurableInbox({store,agent:{enqueue:async m=>sent.push(m.id)},log:{error(){}}});await inbox.init();const key=Buffer.from('cancel-race').toString('base64url');await inbox.update(jobs=>{jobs[key]={status:'queued',message:{id:'cancel-race',from:'5511999990000',text:'Não enviar'},receivedAt:new Date().toISOString()};});const cancellation=inbox.update(jobs=>{jobs[key].status='done';jobs[key].resolution='cancelled_before_send';});inbox.schedule(key);await cancellation;await inbox.drain();assert.deepEqual(sent,[]);assert.equal(inbox.jobs[key].status,'done');}finally{await fs.rm(dir,{recursive:true,force:true});}
});

test('API não acumula novos envios em fila bloqueada e só libera pendentes após conferência explícita',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'delivery-qa-')),store=new Store(dir),sent=[];let server;
 try{
  await store.init();const phone='5511999990000',inbox=new DurableInbox({store,agent:{enqueue:async message=>sent.push(message.id)},log:{error(){}}});await inbox.init();
  await store.updateLead(phone,{nome:'Contato QA'});await store.recordEvent({id:'inbound',phone,direction:'in',text:'Olá'});
  const key=id=>Buffer.from(id).toString('base64url');
  await inbox.update(jobs=>{for(const [id,status] of [['old-message','attention'],['queued-1','queued'],['queued-2','queued']])jobs[key(id)]={status,message:{id,from:phone,manual:true,text:id},receivedAt:new Date().toISOString()};});
  const config=loadConfig({PAINEL_TOKEN:'test-only'});server=http.createServer(createApp({config,store,inbox,log:{error(){}}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  const post=(route,body)=>fetch(base+route,{method:'POST',headers:{Authorization:'Bearer test-only','Content-Type':'application/json'},body:JSON.stringify(body)});
  const response=await post('/leads/'+phone+'/reply',{text:'Não deve ser duplicada',requestId:crypto.randomUUID()});assert.equal(response.status,409);assert.match(await response.text(),/confir/i);assert.equal(Object.keys(inbox.jobs).length,3);assert.deepEqual(sent,[]);
  inbox.resume();await inbox.drain();assert.deepEqual(sent,[]);
  assert.equal((await post('/inbox/cancel',{id:'old-message'})).status,409);assert.equal((await post('/inbox/cancel',{id:'queued-2'})).status,200);assert.equal(inbox.jobs[key('queued-2')].resolution,'cancelled_before_send');
  assert.equal((await post('/inbox/resolve',{id:'old-message',resolution:'handled_manually'})).status,200);await inbox.drain();assert.deepEqual(sent,['queued-1']);assert.equal(inbox.jobs[key('old-message')].status,'done');
 }finally{if(server)await new Promise(r=>server.close(r));await fs.rm(dir,{recursive:true,force:true});}
});
