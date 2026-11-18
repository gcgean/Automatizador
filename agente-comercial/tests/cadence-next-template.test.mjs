import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';import {CadenceService} from '../server/cadence.js';
test('cadência troca para o próximo modelo só depois da aprovação da Meta',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');const db=new Pool({connectionString:url.toString()}),schema='nexttpl_'+crypto.randomBytes(8).toString('hex');await db.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const root=new PgStore(url.toString(),'.');
 try{
  await root.init();
  const body=text=>[{type:'BODY',text}],templates=[{name:'retorno_v1',status:'APPROVED',language:'pt_BR',category:'MARKETING',components:body('Oi, sou a IARA.')},{name:'retorno_v2',status:'PENDING',language:'pt_BR',category:'MARKETING',components:body('Oi, sou a HELENA.')}];
  const cadence=new CadenceService(root,{},{fetchImpl:async()=>({ok:true,json:async()=>({data:templates})})});cadence.bind({configFor:async()=>({graphVersion:'v21.0',wabaId:'1',accessToken:'x'})});
  await root.pool.query("INSERT INTO cadence_settings(connection_id,enabled,max_attempts,template_name,language,next_template_name,next_language) VALUES('default',true,5,'retorno_v1','pt_BR','retorno_v2','pt_BR')");
  let settings=await cadence.settings('default');
  assert.equal((await cadence.currentTemplate('default',settings)).name,'retorno_v1','pendente: continua no atual');
  assert.equal((await cadence.settings('default')).next_template_name,'retorno_v2');
  templates[1].status='APPROVED';
  assert.equal((await cadence.currentTemplate('default',settings)).body,'Oi, sou a HELENA.','aprovado: passa a usar o novo');
  settings=await cadence.settings('default');assert.equal(settings.template_name,'retorno_v2');assert.equal(settings.next_template_name,null);
  assert.equal((await cadence.currentTemplate('default',settings)).name,'retorno_v2');
 }finally{await root.close();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();}
});
