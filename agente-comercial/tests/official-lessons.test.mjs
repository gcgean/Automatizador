import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';
import {CommercialGrowth} from '../server/commercial-growth.js';
import {Demonstrations,rankDemonstrations} from '../server/demonstrations.js';
import {parseOfficialLessons,synchronizeOfficialLessons} from '../server/official-lessons.js';
import {consultativeLead} from '../server/lead-nurturing.js';
test('perfil consultivo usa identidade e complexidade declaradas',()=>{
 assert.equal(consultativeLead({},'Meu contador pediu uma nota'),false);
 assert.equal(consultativeLead({},'Sou contador e quero conhecer'),true);
 assert.equal(consultativeLead({segmento:'Escritório contábil'}),true);
 assert.equal(consultativeLead({},'Quero integração para várias empresas'),true);
 assert.equal(consultativeLead({},'Como funciona a integração?'),false);
});
test('importação oficial é idempotente, pesquisável e separada de Cilos',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');
 const db=new Pool({connectionString:url.toString()}),schema='lessons_'+crypto.randomBytes(6).toString('hex');await db.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const store=new PgStore(url.toString(),'.');
 const payload=JSON.parse(await fs.readFile('test-results/command-aulas-20261123.json','utf8')),fake=async()=>({ok:true,text:async()=>JSON.stringify(payload)});
 try{await store.init();await store.pool.query("INSERT INTO context_profiles(id,name,body,company_id) VALUES('default','Test','Command Server','default') ON CONFLICT DO NOTHING");await store.pool.query("UPDATE whatsapp_connections SET context_id='default' WHERE id='default'");await new CommercialGrowth(store,{}).init();
 const parsed=parseOfficialLessons(payload);assert.equal(parsed.length,119);assert.throws(()=>parseOfficialLessons({...payload,totalVideos:120}));
 const first=await synchronizeOfficialLessons(store,{apply:true,fetchImpl:fake});assert.equal(first.created,119);
 const second=await synchronizeOfficialLessons(store,{apply:true,fetchImpl:fake});assert.equal(second.unchanged,119);assert.equal(second.updated,0);
 const demos=new Demonstrations(store,{dataDir:'.'}),rows=await demos.published('default');assert.ok(rankDemonstrations(rows,'ordem serviço','oficina').length);assert.ok(rankDemonstrations(rows,'contas pagar','financeiro').length);assert.equal((await demos.published('cilos-comercial')).length,0);assert.match(await demos.instructions('default'),/119/);
 await assert.rejects(()=>synchronizeOfficialLessons(store,{apply:true,fetchImpl:async()=>({ok:true,text:async()=>'{}'})}));assert.equal((await demos.published('default')).length,119);
 }finally{await store.close();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();}
});
