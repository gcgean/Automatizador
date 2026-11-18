import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';import {setConversationClosed} from '../server/conversation-lifecycle.js';import {ClosureReasons,systemReason,NO_INTERACTION_NAME} from '../server/closure-reasons.js';
test('motivos de finalização: cadastro, obrigatoriedade, vários motivos por chamado e relatório',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');const db=new Pool({connectionString:url.toString()}),schema='closure_'+crypto.randomBytes(8).toString('hex');await db.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const root=new PgStore(url.toString(),'.');
 try{
  await root.init();const store=root.scope('default'),reasons=new ClosureReasons(root.pool),user={id:crypto.randomUUID(),name:'Operador'};
  await root.pool.query("INSERT INTO users(id,email,name,role) VALUES($1,'closure@qa.test',$2,'admin')",[user.id,user.name]);
  // Motivo do sistema existe desde a primeira listagem e não é duplicado.
  let list=await reasons.list('default',true);assert.equal(list.required,false);assert.deepEqual(list.reasons.map(r=>[r.name,r.system]),[[NO_INTERACTION_NAME,true]]);
  assert.equal(await systemReason(root.pool,'default'),list.reasons[0].id);
  list=await reasons.save('default',{name:'  Sem   interesse '});list=await reasons.save('default',{name:'Comprou concorrente'});
  assert.deepEqual(list.reasons.map(r=>r.name),['Comprou concorrente','Sem interesse',NO_INTERACTION_NAME]);
  await assert.rejects(reasons.save('default',{name:'sem interesse'}),/Já existe/);
  await assert.rejects(reasons.save('default',{name:''}),/até 80/);
  const system=list.reasons.find(r=>r.system),noInterest=list.reasons.find(r=>r.name==='Sem interesse'),rival=list.reasons.find(r=>r.name==='Comprou concorrente');
  await assert.rejects(reasons.save('default',{name:system.name,active:false},system.id),/cadência/);
  // Opcional: finaliza sem motivo.
  const a='5511999907001',b='5511999907002',c='5511999907003';for(const phone of [a,b,c])await store.updateLead(phone,{nome:'QA '+phone,status:'encaminhado'});
  let closed=await setConversationClosed(store,a,true,user);assert.equal(closed.conversationClosed,true);assert.deepEqual(closed.conversationClosedReasonNames,[]);
  // Obrigatório: recusa sem motivo, com motivo inativo e com motivo de outra empresa.
  list=await reasons.setRequired('default',true);assert.equal(list.required,true);
  await assert.rejects(setConversationClosed(store,b,true,user),/Informe o motivo/);assert.equal((await store.getLead(b)).conversationClosed,undefined);
  await assert.rejects(setConversationClosed(store,b,true,user,{},null,['x']),/inválido/);
  await reasons.save('default',{name:'Comprou concorrente',active:false},rival.id);
  await assert.rejects(setConversationClosed(store,b,true,user,{},null,[rival.id]),/não está mais disponível/);
  assert.equal((await reasons.list('default')).reasons.some(r=>r.id===rival.id),false,'inativo some da finalização');
  await reasons.save('default',{name:'Comprou concorrente',active:true},rival.id);
  // Vários motivos no mesmo chamado.
  const ticketB=(await store.getLead(b)).ticketId;
  closed=await setConversationClosed(store,b,true,user,{},null,[noInterest.id,rival.id,noInterest.id.toUpperCase()]);
  assert.deepEqual([...closed.conversationClosedReasonNames].sort(),['Comprou concorrente','Sem interesse']);
  assert.equal((await root.pool.query('SELECT count(*)::int n FROM ticket_closure_reasons WHERE ticket_id=$1',[ticketB])).rows[0].n,2);
  closed=await setConversationClosed(store,c,true,user,{},null,[noInterest.id]);
  // Reabrir limpa o motivo exibido e abre um chamado novo sem motivo.
  const reopened=await setConversationClosed(store,b,false,user);assert.equal(reopened.conversationClosed,false);assert.ok(!reopened.conversationClosedReasonNames?.length);assert.notEqual(String((await store.getLead(b)).ticketId),String(ticketB));
  const from=new Date(Date.now()-86400000).toISOString(),to=new Date(Date.now()+86400000).toISOString(),report=await reasons.report(['default'],from,to);
  assert.equal(report.closed,3);assert.equal(report.withoutReason,1);
  assert.deepEqual(report.reasons.map(r=>[r.name,r.total]),[['Sem interesse',2],['Comprou concorrente',1]]);
  assert.deepEqual(await reasons.report(['outra-conexao'],from,to),{closed:0,withoutReason:0,reasons:[]});
 }finally{await root.close();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();}
});
