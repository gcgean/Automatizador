import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';import {SalesAgent} from '../server/agent.js';import {CLOSE_TOOL,validateCloseRequest,resolveReasons} from '../server/ai-closure.js';import {ClosureReasons} from '../server/closure-reasons.js';

test('pedido de encerramento: motivos limpos e bloqueios',()=>{
 assert.deepEqual(validateCloseRequest({},{motivos:['Dúvida esclarecida.',' dúvida  esclarecida','Sem interesse no momento','x','Outro','Mais um'],resumo:'ok'}).names,['Dúvida esclarecida','Sem interesse no momento','Outro']);
 assert.throws(()=>validateCloseRequest({status:'encaminhado'},{motivos:['A b c']}),/humana/);
 assert.throws(()=>validateCloseRequest({agendamentoResumo:'amanhã'},{motivos:['A b c']}),/agendada/);
 assert.throws(()=>validateCloseRequest({conversationClosed:true},{motivos:['A b c']}),/finalizado/);
 assert.throws(()=>validateCloseRequest({},{motivos:[]}),/1 a 3/);
 assert.throws(()=>validateCloseRequest({},{motivos:['Cliente 88999990000']}),/1 a 3/);
 assert.equal(CLOSE_TOOL.name,'encerrar_atendimento');
});

test('HELENA finaliza conversa concluída com motivo existente ou criado',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');const db=new Pool({connectionString:url.toString()}),schema='aiclose_'+crypto.randomBytes(8).toString('hex');await db.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const root=new PgStore(url.toString(),'.');
 try{
  await root.init();const store=root.scope('default'),reasons=new ClosureReasons(root.pool);await reasons.list('default');await reasons.save('default',{name:'Dúvida esclarecida'});
  let systemSeen='',toolsSeen=[];const plan=new Map();
  const providerFactory=()=>({name:'deepseek',complete:async({system,tools,messages})=>{systemSeen=system;toolsSeen=tools.map(t=>t.name);const last=messages.at(-1);
   if(last.role==='tool')return {append:[{role:'assistant',content:'De nada! Até mais.'}],text:'De nada! Até mais.',toolCalls:[]};
   const motivos=plan.get(String(last.content).match(/\[(\w+)\]/)?.[1]);
   if(!motivos)return {append:[{role:'assistant',content:'Como posso ajudar?'}],text:'Como posso ajudar?',toolCalls:[]};
   return {append:[],toolCalls:[{id:'c'+crypto.randomUUID(),name:'encerrar_atendimento',input:{motivos,resumo:'Cliente agradeceu e encerrou.'}}]};},toolResults:r=>[{role:'tool',content:JSON.stringify(r)}]});
  const sent=[],agent=new SalesAgent({config:{aiProvider:'deepseek',sellerNumbers:[]},store,providerFactory,whatsapp:{markRead:async()=>{},sendText:async(to,text,meta)=>{sent.push(text);await store.recordEvent({id:crypto.randomUUID(),phone:to,text,direction:'out',state:'accepted',...meta});return {messages:[{id:'m'}]};}}});
  async function say(phone,tag,text,lead={}){await store.updateLead(phone,{nome:'QA',...lead});await store.recordEvent({id:'in-'+phone+tag,phone,direction:'in',actor:'client',text:'['+tag+'] '+text,at:new Date().toISOString()});return agent.handle({id:'in-'+phone+tag,from:phone,text:'['+tag+'] '+text});}
  // Motivo existente (sem diferenciar acento/maiúscula) + motivo novo criado pela IA.
  plan.set('fim',['duvida esclarecida','Sem necessidade no momento']);
  await root.pool.query("INSERT INTO cadence_queue(connection_id,phone,cycle_id,inbound_id,question,status,preferred_time) VALUES('default','5588900000001',$1,'x','?','waiting','10:00')",[crypto.randomUUID()]);
  const reply=await say('5588900000001','fim','Muito obrigado, Helena');
  assert.equal(reply,'De nada! Até mais.');assert.equal(sent.at(-1),'De nada! Até mais.','despedida enviada');
  assert.ok(toolsSeen.includes('encerrar_atendimento'));assert.match(systemSeen,/ENCERRAMENTO DO ATENDIMENTO/);assert.match(systemSeen,/"Dúvida esclarecida"/);assert.doesNotMatch(systemSeen,/"Falta de interação"/);
  let lead=await store.getLead('5588900000001');assert.equal(lead.conversationClosed,true);assert.equal(lead.conversationClosedBy,'ai');assert.deepEqual(lead.conversationClosedReasonNames,['Dúvida esclarecida','Sem necessidade no momento']);
  assert.equal((await root.pool.query("SELECT status FROM cadence_queue WHERE phone='5588900000001'")).rows[0].status,'stopped');
  const list=(await reasons.list('default',true)).reasons;assert.equal(list.find(r=>r.name==='Sem necessidade no momento').createdByAi,true);assert.equal(list.find(r=>r.name==='Dúvida esclarecida').createdByAi,false);
  assert.equal((await root.pool.query('SELECT count(*)::int n FROM ticket_closure_reasons WHERE ticket_id=$1',[lead.ticketId])).rows[0].n,2);
  // Não duplica o motivo criado e respeita motivo desativado pela equipe.
  plan.set('fim2',['sem necessidade no momento']);await say('5588900000002','fim2','Valeu, era só isso');
  assert.equal((await reasons.list('default',true)).reasons.filter(r=>/necessidade/i.test(r.name)).length,1);
  const off=list.find(r=>r.name==='Dúvida esclarecida');await reasons.save('default',{name:off.name,active:false},off.id);
  assert.deepEqual((await resolveReasons(root.pool,'default',['Dúvida esclarecida'])).length,0,'motivo desativado não é usado nem recriado');
  // Atendimento humano e apresentação agendada: não finaliza (ferramenta devolve erro e a conversa segue).
  plan.set('h',['Sem necessidade no momento']);await say('5588900000003','h','Obrigado',{status:'encaminhado'});assert.notEqual((await store.getLead('5588900000003')).conversationClosed,true);
  plan.set('ag',['Sem necessidade no momento']);await say('5588900000004','ag','Obrigado, até amanhã',{agendamentoResumo:'Amanhã 10h'});assert.notEqual((await store.getLead('5588900000004')).conversationClosed,true);
  // Conversa normal não é finalizada.
  await say('5588900000005','x','Quanto custa?');assert.notEqual((await store.getLead('5588900000005')).conversationClosed,true);
 }finally{await root.close();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();}
});
