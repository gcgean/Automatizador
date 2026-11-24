import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import http from 'node:http';
import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';
import {CommercialGrowth} from '../server/commercial-growth.js';
import {PRODUCT_SEEDS} from '../server/commercial-products.js';
import {commercialPage} from '../server/commercial-pages.js';
import {commercialContent} from '../server/commercial-page-content.js';
import {createApp} from '../server/index.js';

test('páginas específicas têm conteúdo por necessidade, condições e destinos seguros',()=>{
 const headlines=new Set();
 for(const p of PRODUCT_SEEDS){const content=commercialContent(p),html=commercialPage({product:p,companyName:p.family==='cilos'?'Cilos':'Command System',phone:'5511999900000'});headlines.add(content.headline);assert.equal(content.focus.length,3);assert.ok(html.includes(content.headline));assert.match(html,/EXEMPLO ILUSTRATIVO/);assert.match(html,/data-focus=/);assert.equal(html.includes('>Começar teste<'),!!p.trialConfirmed,p.id);}
 assert.equal(headlines.size,PRODUCT_SEEDS.length);
 const hostile={id:'nfe',name:'<script>bad()</script>',benefit:'<img onerror="bad()">',trialConfirmed:true,trialUrl:'javascript:bad()',salesUrl:'javascript:bad()'};
 const html=commercialPage({product:hostile,companyName:'Empresa <teste>',phone:'invalid',curated:false,focusId:'<script>bad()</script>'});assert.ok(!html.includes('<script>bad()'));assert.ok(!html.includes('href="javascript:'));assert.match(html,/Empresa &lt;teste&gt;/);assert.ok(!html.includes('Cadastros de clientes e produtos'));assert.ok(!html.includes('NF-e no navegador'));
});

test('páginas públicas preservam privacidade, vídeos aprovados, referências e eventos distintos de cadastro',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');const db=new Pool({connectionString:url.toString()}),schema='pages_'+crypto.randomBytes(8).toString('hex');await db.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const store=new PgStore(url.toString(),'.');let server;
 try{
  await store.init();await store.pool.query("INSERT INTO context_profiles(id,name,body,company_id) VALUES('default','Synthetic','Command Server','default') ON CONFLICT DO NOTHING");await store.pool.query("UPDATE whatsapp_connections SET enabled=true,context_id='default',display_phone='+55 11 99999-0000' WHERE id='default'");const config={publicUrl:'https://sales.example.com',connectionsKey:'a'.repeat(64)},growth=new CommercialGrowth(store,config);await growth.init();
  const p=(await growth.products('default')).find(p=>p.id==='oficina'),phone='5511999900888';await store.updateLead(phone,{nome:'PRIVATE CLIENT NAME',dor_principal:'Preciso conferir as peças utilizadas',segmento:'PRIVATE SEGMENT',produtos_interesse:'Oficina'});
  const link=await growth.makeLink('default',phone,p);assert.match(await growth.redirect(link.token),/^https:\/\/commandweb\.net\/oficina\?commercial_ref=/);
  const legacy=crypto.randomUUID();await store.pool.query('INSERT INTO commercial_links(id,connection_id,phone,product_id,destination) VALUES($1,$2,$3,$4,$5)',[legacy,'default',phone,'oficina',growth.landingUrl('default',p)]);assert.match(await growth.redirect(legacy),/^https:\/\/commandweb\.net\/oficina\?commercial_ref=/);
  for(const [published,title]of [[true,'Vídeo aprovado'],[false,'DRAFT PRIVATE TITLE']])await store.pool.query('INSERT INTO demonstration_videos(id,connection_id,product_id,data,published) VALUES($1,$2,$3,$4,$5)',[crypto.randomUUID(),'default','oficina',{title,summary:'Resumo aprovado'},published]);
  const html=await growth.publicPage('default','oficina',link.token);assert.match(html,/Vídeo aprovado/);assert.ok(!html.includes('DRAFT PRIVATE TITLE'));assert.ok(!html.includes(phone));assert.ok(!html.includes('PRIVATE CLIENT NAME'));assert.ok(!html.includes('PRIVATE SEGMENT'));assert.match(html,/data-selected-focus="pecas"/);
  assert.ok(!(await growth.publicPage('default','oficina',crypto.randomUUID())).includes('data-page-ref="'+link.token+'"'));
  const body={ref:link.token,sessionId:crypto.randomUUID(),type:'view',action:'',focus:'pecas'};assert.equal((await growth.publicPageEvent('default','oficina',body)).recorded,true);assert.equal((await growth.publicPageEvent('default','oficina',body)).recorded,false);
  assert.equal((await growth.publicPageEvent('default','nfse',body)).recorded,false);await assert.rejects(growth.publicPageEvent('default','oficina',{...body,type:'signup_completed'}),/inválido/);await assert.rejects(growth.publicPageEvent('default','oficina',{...body,phone:'other'}),/inválido/);
  await growth.publicPageEvent('default','oficina',{...body,type:'cta',action:'contact'});assert.equal((await store.pool.query("SELECT count(*)::int AS n FROM commercial_events WHERE kind='signup_completed'")).rows[0].n,0);
  // Older direct links remain valid after enabling the richer presentation pages.
  const testProduct={id:'trial',name:'Synthetic',tags:[],trialConfirmed:true,trialUrl:'https://product.example.com/signup',enabled:true};await store.pool.query('INSERT INTO commercial_products(connection_id,id,data) VALUES($1,$2,$3)',['default','trial',testProduct]);const oldRef=crypto.randomUUID();await store.pool.query('INSERT INTO commercial_links(id,connection_id,phone,product_id,destination) VALUES($1,$2,$3,$4,$5)',[oldRef,'default',phone,'trial',testProduct.trialUrl]);assert.match(await growth.redirect(oldRef),/product.example.com\/signup/);
  server=http.createServer(createApp({config,store,registry:{growth,config},log:{error(){}}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+server.address().port;config.publicUrl=base;
  const page=await fetch(base+'/conhecer/default/oficina');assert.equal(page.status,200);assert.match(page.headers.get('Content-Security-Policy'),/script-src 'self'/);assert.equal((await fetch(base+'/commercial-page.js')).status,200);
  const endpoint=base+'/conhecer/default/oficina/events';assert.equal((await fetch(endpoint,{method:'POST',headers:{Origin:'https://unrelated.example'},body:JSON.stringify(body)})).status,403);assert.equal((await fetch(endpoint,{method:'POST',body:JSON.stringify({...body,type:'focus',action:'segment'})})).status,200);
  await store.updateLead(phone,{optedOut:true});assert.equal((await growth.publicPageEvent('default','oficina',{...body,sessionId:crypto.randomUUID()})).recorded,false);
 }finally{if(server)await new Promise(r=>server.close(r));await store.close();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();}
});
