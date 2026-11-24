import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';
import {setConversationClosed} from '../server/conversation-lifecycle.js';
import {acceptTicketMessage} from '../server/tickets.js';
import {ClosureReasons} from '../server/closure-reasons.js';
import {closureReportCsv} from '../shared/closure-report.js';
import {prefersProductTrial} from '../server/commercial-growth.js';
import {SalesAgent} from '../server/agent.js';

test('pedido de teste recebe link antes de agenda; reunião e humano explícitos continuam disponíveis',async()=>{
 for(const text of ['Quero testar o sistema','Me manda o link','Posso experimentar?'])assert.equal(prefersProductTrial(text),true,text);
 for(const text of ['Não quero testar','Quero agendar uma apresentação','Quero testar e falar com vendedor','Quero uma reunião'])assert.equal(prefersProductTrial(text),false,text);
 const calls=[],agent=new SalesAgent({store:{connectionId:'default'},config:{},growth:{productLink:async(id,phone,input)=>{calls.push({id,phone,input});return 'link autorizado';}},agenda:{consult:async()=>{calls.push('agenda');return {reply:'Horários reais'};}}});
 assert.equal(await agent.runTool('synthetic','consultar_horarios_apresentacao',{}, {id:'trial',text:'Quero testar o sistema'}),'link autorizado');assert.equal(calls.length,1);
 assert.deepEqual(await agent.runTool('synthetic','consultar_horarios_apresentacao',{}, {id:'meeting',text:'Quero agendar uma conversa de tira dúvidas'}),{agendaReply:'Horários reais'});assert.equal(calls.at(-1),'agenda');
 const csv=closureReportCsv([{ticketId:1,note:'=HYPERLINK("externo")',name:'Cliente; teste',reasons:['Preço'],adId:'123'}]);assert.ok(csv.startsWith('\ufeff'));assert.match(csv,/'=HYPERLINK/);assert.match(csv,/"Cliente; teste"/);assert.match(csv,/Observação/);
});

test('observação opcional fica no chamado, conserva anúncio, respeita filtros/acesso e não vira perda',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');const db=new Pool({connectionString:url.toString()}),schema='notes_'+crypto.randomBytes(8).toString('hex');await db.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const root=new PgStore(url.toString(),'.');
 try{
  await root.init();const store=root.scope('default'),service=new ClosureReasons(root.pool),user={id:crypto.randomUUID(),name:'Vendedor QA'},other={id:crypto.randomUUID(),name:'Outro QA'},departmentId=crypto.randomUUID();
  for(const u of [user,other])await root.pool.query("INSERT INTO users(id,email,name,role) VALUES($1,$2,$3,'operator')",[u.id,u.id+'@qa.test',u.name]);
  await root.pool.query("INSERT INTO departments(id,company_id,name) VALUES($1,'default','Vendas QA')",[departmentId]);await root.pool.query('INSERT INTO department_users(department_id,user_id) VALUES($1,$2)',[departmentId,user.id]);
  const phone='5511999900800';await store.updateLead(phone,{nome:'Contato sintético',resultado:'aberto',assignedUserId:user.id,assignedUserName:user.name,departmentId});const lead=await store.getLead(phone);
  await root.pool.query("INSERT INTO meta_ad_attribution(connection_id,phone,ctwa_clid,source_id,inbound_id) VALUES('default',$1,'synthetic','ad-original','synthetic-inbound')",[phone]);
  await assert.rejects(setConversationClosed(store,phone,true,user,{},null,[],42),/2.000/);await assert.rejects(setConversationClosed(store,phone,true,user,{},null,[],'x'.repeat(2001)),/2.000/);
  const note='Cliente informou que faltou integração.\nNão confirmou contratação.';
  const closed=await setConversationClosed(store,phone,true,user,{},lead.ticketId,[],note);assert.equal(closed.conversationClosedNote,note);assert.equal(closed.resultado,'aberto');
  await setConversationClosed(store,phone,true,user,{},lead.ticketId,[],'Repetição não altera o registro');
  const from=new Date(Date.now()-86400000).toISOString(),to=new Date(Date.now()+86400000).toISOString(),opts={includeDetails:true,viewer:{...user,role:'operator'}};
  let report=await service.report(['default'],from,to,opts);assert.equal(report.details.length,1);assert.equal(report.details[0].note,note);assert.equal(report.details[0].adId,'ad-original');assert.equal(report.details[0].closedBy,user.name);
  assert.equal((await service.report(['default'],from,to,{includeDetails:true,viewer:{...other,role:'operator'}})).details.length,0);
  assert.equal((await service.report(['default'],from,to,{...opts,userId:other.id})).closed,0);assert.equal((await service.report(['default'],from,to,{...opts,departmentId})).closed,1);assert.equal((await service.report(['unavailable-connection'],from,to,{includeDetails:true})).details.length,0);
  await assert.rejects(service.report(['default'],from,to,{includeDetails:true,page:0}),/Filtro/);
  await setConversationClosed(store,phone,false,user);assert.equal((await store.getLead(phone)).conversationClosedNote,false);assert.notEqual(String((await store.getLead(phone)).ticketId),String(lead.ticketId));
  await root.pool.query("UPDATE meta_ad_attribution SET source_id='new-ad' WHERE phone=$1",[phone]);report=await service.report(['default'],from,to,{includeDetails:true});assert.equal(report.details.find(r=>String(r.ticketId)===String(lead.ticketId)).adId,'ad-original');
  const empty=await setConversationClosed(store,phone,true,user);assert.equal(empty.conversationClosedNote,false);report=await service.report(['default'],from,to,{includeDetails:true});assert.equal(report.details.length,2);assert.equal(report.details.find(r=>String(r.ticketId)!==String(lead.ticketId)).note,'');
  await store.transaction(tx=>acceptTicketMessage(tx,phone,'new-inbound',new Date().toISOString()));assert.equal((await store.getLead(phone)).conversationClosedNote,false);
 }finally{await root.close();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();}
});
