import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {Readable} from 'node:stream';
import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';
import {CommercialGrowth} from '../server/commercial-growth.js';
import {Demonstrations,youtubeVideoId,parseCaptions,rankDemonstrations,validateDemonstration} from '../server/demonstrations.js';
import {createApp} from '../server/index.js';

test('YouTube, legendas com tempo e busca pertinente sem obedecer instruções do vídeo',()=>{
 assert.equal(youtubeVideoId('https://youtu.be/abcdefghijk?t=10'),'abcdefghijk');assert.equal(youtubeVideoId('https://www.youtube.com/shorts/abcdefghijk'),'abcdefghijk');
 for(const u of ['https://youtube.com.evil.test/watch?v=abcdefghijk','https://127.0.0.1/watch?v=abcdefghijk','javascript:alert(1)'])assert.throws(()=>youtubeVideoId(u));
 const parsed=parseCaptions('1\n00:00:05,000 --> 00:00:09,000\nCadastro de produtos.\n\n2\n00:00:12,000 --> 00:00:15,000\nConsulta do estoque.');assert.equal(parsed.segments[1].start,12);assert.ok(parsed.text.includes('estoque'));
 assert.equal(parseCaptions('WEBVTT\n\n00:02.000 --> 00:04.500\nOlá').segments[0].start,2);
 const data={title:'Controle de estoque',tags:['estoque'],questions:['Como cadastrar produto?'],summary:'Cadastro de produtos e estoque.',purpose:'recurso',chapters:[{at:12,label:'Consulta do estoque'}]};
 const rows=[{id:'one',data,product_id:'estoque',transcript:parsed.text,segments:parsed.segments}];assert.equal(rankDemonstrations(rows,'como consultar o estoque','estoque')[0].chapter.at,12);assert.equal(rankDemonstrations(rows,'boleto financeiro').length,0);assert.equal(rankDemonstrations(rows,'estoque','outro').length,0);assert.throws(()=>validateDemonstration({...data,chapters:[{at:-1,label:'Erro'}]}));
});
test('biblioteca: revisão, arquivo privado, transcrição, resumo, repetição, cadência e eventos isolados',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');const db=new Pool({connectionString:url.toString()}),schema='demo_'+crypto.randomBytes(8).toString('hex');await db.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const dir=await fs.mkdtemp(path.join(os.tmpdir(),'demos-')),root=new PgStore(url.toString(),dir);let server;
 try{
  await root.init();const config={publicUrl:'https://sales.example.com',dataDir:dir,demonstrationTranscriberUrl:'http://synthetic-transcriber',connectionsKey:'b'.repeat(64)},admin={id:crypto.randomUUID(),role:'admin',company_id:'default',connections:['default']};
  await root.pool.query("INSERT INTO users(id,email,role,company_id) VALUES($1,'demo@qa.test','admin','default')",[admin.id]);await root.pool.query("UPDATE whatsapp_connections SET enabled=true WHERE id='default'");
  const store=root.scope('default'),growth=new CommercialGrowth(root,config);await growth.saveProduct('default',{id:'estoque',name:'Estoque',tags:['Controle de estoque'],trialUrl:'https://product.example.com/signup',trialConfirmed:true,conditions:'Teste sintético'},admin);
  let transcriptions=0,analysisFails=false;const library=new Demonstrations(root,config,{fetchImpl:async(u,o)=>{assert.ok(u.endsWith('/transcribe-library'));let n=0;for await(const c of o.body)n+=c.length;assert.equal(String(n),o.headers['Content-Length']);transcriptions++;return Response.json({text:'Este vídeo mostra cadastro de produto e consulta do estoque.',duration:20,segments:[{start:0,end:10,text:'Cadastro de produto'},{start:10,end:20,text:'Consulta do estoque'}]});},providerFactory:()=>({complete:async()=>({text:analysisFails?'inválido':JSON.stringify({summary:'Demonstra cadastro de produto e consulta do estoque.',tags:['estoque','produto'],questions:['Como cadastrar produto?'],chapters:[{at:10,label:'Consultar estoque'}]}),toolCalls:[]})})});await library.init();const registry={config,growth,demonstrations:library};library.bind(registry);
  const phone='5511999900777';await store.updateLead(phone,{nome:'Contato fictício',produtos_interesse:'Controle de estoque'});const body={title:'Controle de estoque',productId:'estoque',purpose:'recurso',tags:['estoque'],questions:[],chapters:[{at:10,label:'Consulta do estoque'}],summary:'Como cadastrar um produto.',youtubeUrl:'https://youtu.be/abcdefghijk'};
  let video=await library.save('default',null,body,admin);await assert.rejects(library.publish('default',video.id,{version:video.version,published:true},admin),/Revise/);assert.equal((await library.search('default','estoque')).length,0);
  video=await library.publish('default',video.id,{version:video.version,published:true,reviewed:true},admin);assert.equal((await library.search('default','estoque'))[0].id,video.id);
  await assert.rejects(library.detail('default',video.id,{...admin,company_id:'other'}),/indisponível/);await assert.rejects(library.save('default',video.id,{...body,version:0},admin),/mudou/);
  const found=JSON.parse(await library.findForLead('default',phone,{duvida:'Como consultar estoque?',produto:'estoque',reenviar:false}));assert.ok(found.url.includes('/assistir/'));const link=found.url.split('/').at(-1);
  const page=await library.page(link,true);assert.ok(page.includes('youtube-nocookie.com'));assert.ok(page.includes('Testar o sistema'));assert.ok(!page.includes(phone));
  await store.recordEvent({id:'demo-sent',phone,direction:'out',actor:'ai',text:found.url,state:'accepted'});await library.recordSent('default',phone,found.url);assert.match(await library.findForLead('default',phone,{duvida:'estoque',produto:'estoque',reenviar:false}),/Nenhuma demonstração/);
  await library.event(link,{kind:'play',progress:0});await library.event(link,{kind:'play',progress:0});await library.event(link,{kind:'progress',progress:50});await assert.rejects(library.event(link,{kind:'complete',progress:25}),/inválido/);assert.equal((await library.metrics('default',admin))[0].plays,1);assert.equal((await library.contact('default',phone,admin))[0].progress,50);
  assert.equal(await library.cadenceTemplate('default',phone,[],[]),null);
  video=await library.publish('default',video.id,{version:video.version,published:false},admin);await assert.rejects(library.publicRecord(link,true),/não está mais disponível/);
  let upload=await library.save('default',null,{...body,title:'Vídeo original',youtubeUrl:''},admin);const bytes=Buffer.from('synthetic-video-content'),req=Readable.from([bytes]);req.headers={'content-type':'video/mp4','content-length':String(bytes.length)};upload=await library.upload('default',upload.id,req,admin,upload.version);assert.equal(upload.jobStatus,'queued');
  const auth={handle:async()=>false,user:async req=>req.headers.authorization==='synthetic'?admin:null,sameOrigin:()=>true};server=http.createServer(createApp({config,store:root,auth,registry,log:{error:()=>{}}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;
  assert.equal((await fetch(base+'/demonstrations')).status,401);assert.equal((await fetch(base+'/demonstracoes/'+upload.id+'/media')).status,410);assert.equal((await fetch(base+'/demonstrations/'+upload.id+'/media',{headers:{authorization:'synthetic',Range:'bytes=0-3'}})).status,206);
  await Promise.all([library.tick(),library.tick()]);upload=await library.detail('default',upload.id,admin);assert.equal(transcriptions,1);assert.equal(upload.jobStatus,'ready');assert.ok(upload.transcript.includes('estoque'));assert.equal(upload.chapters[0].at,10);assert.equal(upload.published,false);
  upload=await library.publish('default',upload.id,{version:upload.version,published:true,reviewed:true},admin);const media=await fetch(base+'/demonstracoes/'+upload.id+'/media',{headers:{Range:'bytes=0-3'}});assert.equal(media.status,206);assert.equal(await media.text(),'synt');
  analysisFails=true;upload=await library.queue('default',upload.id,{version:upload.version,kind:'analyze'},admin);await library.tick();upload=await library.detail('default',upload.id,admin);assert.ok(upload.analysisError);assert.ok(upload.transcript.includes('estoque'));assert.equal(upload.published,false);
  await store.updateLead(phone,{optedOut:true});assert.equal(await library.makeLink('default',phone,await library.row(upload.id,'default')),null);
 }finally{if(server){server.closeAllConnections();await new Promise(r=>server.close(r));}await root.close();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();assert.equal(path.dirname(path.resolve(dir)),path.resolve(os.tmpdir()));assert.ok(path.basename(dir).startsWith('demos-'));await fs.rm(dir,{recursive:true,force:true});}
});
