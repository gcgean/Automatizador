import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';import {setConversationClosed} from '../server/conversation-lifecycle.js';import {ClosureReasons,systemReason,NO_INTERACTION_NAME,NO_INTEREST,OPT_OUT} from '../server/closure-reasons.js';import {closeConversationBySystem} from '../server/conversation-lifecycle.js';import {SalesAgent} from '../server/agent.js';
test('motivos de finalização: cadastro, obrigatoriedade, vários motivos por chamado e relatório',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');const db=new Pool({connectionString:url.toString()}),schema='closure_'+crypto.randomBytes(8).toString('hex');await db.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const root=new PgStore(url.toString(),'.');
 try{
  await root.init();const store=root.scope('default'),reasons=new ClosureReasons(root.pool),user={id:crypto.randomUUID(),name:'Operador'};
  await root.pool.query("INSERT INTO users(id,email,name,role) VALUES($1,'closure@qa.test',$2,'admin')",[user.id,user.name]);
  // Motivo do sistema existe desde a primeira listagem e não é duplicado.
  let list=await reasons.list('default',true);assert.equal(list.required,false);assert.deepEqual(list.reasons.map(r=>[r.name,r.system]),[['Cliente sem interesse',true],[NO_INTERACTION_NAME,true],['Pediu para não ser contatado',true]]);
  assert.equal(await systemReason(root.pool,'default'),list.reasons.find(r=>r.name===NO_INTERACTION_NAME).id);
  list=await reasons.save('default',{name:'  Sem   interesse '});list=await reasons.save('default',{name:'Comprou concorrente'});
  assert.deepEqual(list.reasons.filter(r=>!r.system).map(r=>r.name),['Comprou concorrente','Sem interesse']);
  await assert.rejects(reasons.save('default',{name:'sem interesse'}),/Já existe/);
  await assert.rejects(reasons.save('default',{name:''}),/até 80/);
  const system=list.reasons.find(r=>r.system),noInterest=list.reasons.find(r=>r.name==='Sem interesse'),rival=list.reasons.find(r=>r.name==='Comprou concorrente');
  await assert.rejects(reasons.save('default',{name:system.name,active:false},system.id),/automaticamente/);
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
  // A IA finaliza após recusa clara: grava o motivo automático e para a cadência.
  const d='5511999907004',e='5511999907005';for(const phone of [d,e])await store.updateLead(phone,{nome:'QA '+phone});
  await root.pool.query("INSERT INTO cadence_queue(connection_id,phone,cycle_id,inbound_id,question,status,preferred_time) VALUES('default',$1,$2,'qa','Pergunta?','waiting','10:00')",[d,crypto.randomUUID()]);
  const ticketD=(await store.getLead(d)).ticketId;
  closed=await closeConversationBySystem(store,d,NO_INTEREST);assert.equal(closed.conversationClosed,true);assert.equal(closed.conversationClosedBy,'ai');assert.deepEqual(closed.conversationClosedReasonNames,['Cliente sem interesse']);
  assert.equal((await root.pool.query('SELECT status FROM cadence_queue WHERE phone=$1',[d])).rows[0].status,'stopped');
  assert.equal((await root.pool.query("SELECT r.system_key FROM ticket_closure_reasons x JOIN closure_reasons r ON r.id=x.reason_id WHERE x.ticket_id=$1",[ticketD])).rows[0].system_key,'no_interest');
  assert.equal((await closeConversationBySystem(store,d,NO_INTEREST)).conversationClosed,true,'repetir não duplica');
  assert.equal((await root.pool.query('SELECT count(*)::int n FROM ticket_closure_reasons WHERE ticket_id=$1',[ticketD])).rows[0].n,1);
  assert.deepEqual((await closeConversationBySystem(store,e,OPT_OUT)).conversationClosedReasonNames,['Pediu para não ser contatado']);
  assert.equal(await closeConversationBySystem(store,'5511000000000',NO_INTEREST),null);
  // Fluxo completo: cliente recusa, IA agradece sem chamar o modelo e finaliza; em atendimento humano não finaliza.
  const sent=[],agent=new SalesAgent({config:{aiProvider:'deepseek',sellerNumbers:[]},store,providerFactory:()=>({async reply(){throw new Error('modelo não deve ser chamado');}}),whatsapp:{markRead:async()=>{},sendText:async(to,text)=>{sent.push({to,text});return {messages:[{id:'out-'+sent.length}]};}}});
  const f='5511999907006',h='5511999907007';await store.updateLead(f,{nome:'Recusa'});await store.updateLead(h,{nome:'Humano',status:'encaminhado'});
  await store.recordEvent({id:'in-f',phone:f,direction:'in',actor:'client',text:'Não tenho mais interesse, obrigado',at:new Date().toISOString()});
  const reply=await agent.handle({id:'in-f',from:f,text:'Não tenho mais interesse, obrigado'});
  assert.match(reply,/encerrar este atendimento/);assert.equal(sent.length,1);
  const refused=await store.getLead(f);assert.equal(refused.conversationClosed,true);assert.deepEqual(refused.conversationClosedReasonNames,['Cliente sem interesse']);
  await store.recordEvent({id:'in-h',phone:h,direction:'in',actor:'client',text:'Não tenho interesse',at:new Date().toISOString()});
  await agent.handle({id:'in-h',from:h,text:'Não tenho interesse'});assert.notEqual((await store.getLead(h)).conversationClosed,true,'atendimento humano não é finalizado pela IA');assert.equal(sent.length,1);
 }finally{await root.close();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();}
});
