import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';import {ClosureReasons,ReasonValidator,similarReason} from '../server/closure-reasons.js';

test('motivo parecido: igual sem acento e mesmas palavras',()=>{
 const list=[{id:'1',name:'Sem interesse'},{id:'2',name:'Preço alto'},{id:'3',name:'Fechou com concorrente'}];
 assert.equal(similarReason('sem interesse',list).reason.id,'1');
 assert.equal(similarReason('PRECO ALTO.',list).how,'igual');
 assert.equal(similarReason('Fechou com o concorrente',list).reason.id,'3');
 assert.equal(similarReason('Concorrentes fechou',list)?.reason.id,'3');
 assert.equal(similarReason('Contato errado',list),null);
});

test('novo motivo validado pela IA na janela de finalização',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');const db=new Pool({connectionString:url.toString()}),schema='reasonval_'+crypto.randomBytes(8).toString('hex');await db.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const root=new PgStore(url.toString(),'.');
 try{
  await root.init();const reasons=new ClosureReasons(root.pool);await reasons.list('default');await reasons.save('default',{name:'Sem interesse'});
  let answer='{"duplicado": null, "nome": "Contato errado"}',calls=0,lastPrompt='';
  const validator=new ReasonValidator(root.pool,{providerFactory:()=>({complete:async({messages})=>{calls++;lastPrompt=messages[0].content;return {text:answer};}}),providerFor:async()=>'deepseek'});
  // Igual a um existente: bloqueia sem chamar a IA.
  let r=await validator.create('default','sem interesse');assert.equal(r.status,'duplicate');assert.equal(r.duplicateOf.name,'Sem interesse');assert.equal(calls,0);
  // A IA reconhece o mesmo sentido com outras palavras.
  const list=(await reasons.list('default',true)).reasons,idx=[...list].sort((a,b)=>a.name.toLowerCase().localeCompare(b.name.toLowerCase())).findIndex(x=>x.name==='Sem interesse')+1;
  answer=`Resposta: {"duplicado": ${idx}, "nome": null}`;r=await validator.create('default','Cliente desistiu da compra');
  assert.equal(r.status,'duplicate');assert.equal(r.how,'ia');assert.equal(r.duplicateOf.name,'Sem interesse');assert.match(lastPrompt,/Cliente desistiu da compra/);
  // Diferente: cria com o nome curto sugerido pela IA.
  answer='{"duplicado": null, "nome": "Número errado"}';r=await validator.create('default','o cliente disse que o número estava errado');
  assert.equal(r.status,'created');assert.equal(r.reason.name,'Número errado');assert.equal(r.aiChecked,true);
  assert.ok((await reasons.list('default')).reasons.some(x=>x.name==='Número errado'));
  // IA fora do ar: cria só se não houver parecido.
  const offline=new ReasonValidator(root.pool,{providerFactory:()=>({complete:async()=>{throw new Error('timeout');}}),providerFor:async()=>'deepseek'});
  r=await offline.create('default','Retornar no próximo mês');assert.equal(r.status,'created');assert.equal(r.aiChecked,false);
  r=await offline.create('default','número errado');assert.equal(r.status,'duplicate');
  // Nome sugerido pela IA que repete um existente também é barrado.
  answer='{"duplicado": null, "nome": "Sem interesse"}';r=await validator.create('default','Não quis seguir');assert.equal(r.status,'duplicate');
  await assert.rejects(validator.create('default','ab'),/3 a 60/);
 }finally{await root.close();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();}
});
