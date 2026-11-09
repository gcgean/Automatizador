import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {Readable} from 'node:stream';
import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';
import {MediaService} from '../server/media.js';
import {SalesAgent} from '../server/agent.js';
import {WhatsAppClient,extractMessages} from '../server/whatsapp.js';

test('anexos: download privado, transcrição, descadastro por voz, envio e deduplicação',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');
 const pool=new Pool({connectionString:url.toString()}),schema='media_'+crypto.randomBytes(8).toString('hex');await pool.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'media-qa-')),store=new PgStore(url.toString(),dir);let server;
 try{
 await store.init();const bytes=Buffer.from('synthetic media for transport test'),sent=[];let transcript='Quero conhecer o sistema',asrFails=false,uploads=0;
 const config={dataDir:dir,transcriberUrl:'http://private-asr',aiProvider:'deepseek',sellerNumbers:[],graphVersion:'v23.0',accessToken:'synthetic',phoneNumberId:'123456'};
 const fake=async(url,options={})=>{
  if(url==='http://private-asr/transcribe')return asrFails?new Response('{}',{status:503}):Response.json({text:transcript});
  if(url==='http://private-asr/convert-audio')return new Response(bytes,{headers:{'Content-Type':'audio/ogg'}});
  if(url==='https://graph.facebook.com/v23.0/123456/media'){uploads++;assert.ok(options.body instanceof FormData);return Response.json({id:'888888'});}
  if(url.endsWith('/messages')){if(!JSON.parse(options.body).status)sent.push(JSON.parse(options.body));return Response.json({messages:[{id:'wamid-'+sent.length}]});}
  if(url.startsWith('https://graph.facebook.com/'))return Response.json({url:'https://lookaside.fbsbx.com/media',mime_type:'audio/ogg',sha256:crypto.createHash('sha256').update(bytes).digest('base64'),file_size:bytes.length});
  if(url==='https://lookaside.fbsbx.com/media')return new Response(bytes);
  throw Error('Unexpected external request '+url);
 };
 const media=new MediaService(store,config,{fetchImpl:fake});await media.init();media.bind({configFor:async()=>({...config,enabled:true})});
 const scoped=store.scope('default'),phone='5511999991111',whatsapp=new WhatsAppClient(config,fake,scoped);let calls=0;
 const agent=new SalesAgent({config,store:scoped,media,whatsapp,providerFactory:()=>({name:'deepseek',complete:async({messages,system})=>{calls++;assert.match(system,/TRANSCRITA COM SUCESSO/);assert.match(system,/limitações antigas/);assert.equal(messages.at(-1).content,transcript);return {text:'Vamos conversar sobre o sistema.',append:[],toolCalls:[]};}})});
 await agent.handle({id:'voice1',from:phone,text:'[áudio recebido]',type:'audio',media:{kind:'audio',id:'777777'}});
 assert.equal(calls,1);const received=(await scoped.getEvents(phone)).find(e=>e.id==='voice1');assert.equal(received.attachment.transcript,transcript);assert.equal(received.attachment.state,'ready');assert.ok(!JSON.stringify(received.attachment).includes('fbsbx'));
 assert.equal((await media.receive('default',phone,'voice1',{kind:'audio',id:'777777'})).id,received.attachment.id);
 await assert.rejects(media.get(received.attachment.id,'other'),/não encontrado/);
 server=http.createServer((req,res)=>media.serve(req,res,received.attachment.id,'default').catch(()=>{res.statusCode=500;res.end();}));await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const r=await fetch('http://127.0.0.1:'+server.address().port,{headers:{Range:'bytes=2-6'}});assert.equal(r.status,206);assert.equal(await r.text(),bytes.subarray(2,7).toString());assert.equal(r.headers.get('cache-control'),'private, no-store');
 for(const [mime,name] of [['image/png','imagem.png'],['video/mp4','video.mp4'],['audio/webm','gravacao.webm'],['application/pdf','arquivo.pdf']]){
  const meta={mime,name,caption:mime.startsWith('audio/')?'':'Legenda',requestId:crypto.randomUUID()};const a=await media.outgoing('default',phone,meta,Readable.from([bytes]));assert.equal((await media.outgoing('default',phone,meta,Readable.from([bytes]))).id,a.id);
  await assert.rejects(media.outgoing('default',phone,{...meta,caption:'outra'},Readable.from([bytes])),/áudio|Identificador/);
  await media.send(agent,phone,a.id);const body=sent.at(-1);assert.equal(body.type,a.kind);assert.equal(body[a.kind].id,'888888');if(a.kind==='audio')assert.equal(a.mime,'audio/ogg');
 }
 assert.equal(uploads,4);
 const p='5511999993333',at=n=>new Date(Date.now()+n*1000).toISOString();await scoped.updateLead(p,{nome:'Contador QA'});
 for(let n=1;n<=2;n++)await scoped.recordEvent({id:'pending-'+n,phone:p,direction:'in',text:'Pergunta '+n,at:at(n)});
 assert.equal((await scoped.listLeads())[p].pendingReplyCount,2);await scoped.getEvents(p);assert.equal((await scoped.listLeads())[p].pendingReplyCount,2);
 await scoped.recordEvent({id:'internal-pending',phone:p,direction:'out',actor:'system',kind:'crm',state:'internal',text:'Registro no CRM',at:at(3)});assert.equal((await scoped.listLeads())[p].pendingReplyCount,2);assert.equal((await scoped.listLeads())[p].lastMessage,'Pergunta 2');
 await scoped.recordEvent({id:'uncertain-pending',phone:p,direction:'out',actor:'ai',state:'uncertain',text:'Resposta sem confirmação',at:at(4)});assert.equal((await scoped.listLeads())[p].pendingReplyCount,2);
 await scoped.recordEvent({id:'accepted-pending',phone:p,direction:'out',actor:'ai',state:'accepted',text:'Resposta confirmada',at:at(5)});assert.equal((await scoped.listLeads())[p].pendingReplyCount,0);
 await scoped.recordEvent({id:'new-pending',phone:p,direction:'in',text:'Outra pergunta',at:at(6)});assert.equal((await scoped.listLeads())[p].pendingReplyCount,1);
await assert.rejects(media.outgoing('default',phone,{mime:'image/png',name:'big.png',caption:'',requestId:crypto.randomUUID()},Readable.from([Buffer.alloc(5*1024*1024+1)])),/limite/);
 transcript='não me mande mais mensagens';const before=sent.length;await agent.handle({id:'voice-optout',from:phone,text:'áudio',media:{kind:'audio',id:'777778'}});assert.equal((await scoped.getLead(phone)).optedOut,true);assert.equal(sent.length,before);assert.equal(calls,1);
 asrFails=true;await agent.handle({id:'voice-failure',from:'5511999992222',text:'áudio',media:{kind:'audio',id:'777779'}});assert.equal((await scoped.getLead('5511999992222')).status,'encaminhado');const failure=(await scoped.getEvents('5511999992222')).find(e=>e.id==='voice-failure');assert.equal(failure.attachment.state,'ready');assert.ok(failure.attachment.error);assert.equal(calls,1);
 const extracted=extractMessages({entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'123456'},messages:[{id:'webhook-media',from:phone,type:'image',image:{id:'555555',mime_type:'image/png',caption:'Minha loja'}}]}}]}]},'123456');assert.equal(extracted[0].media.id,'555555');
 }finally{if(server)await new Promise(resolve=>server.close(resolve));await store.close();await pool.query('DROP SCHEMA '+schema+' CASCADE');await pool.end();await fs.rm(dir,{recursive:true,force:true});}
});
