import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';import {setConversationClosed} from '../server/conversation-lifecycle.js';
import {listAttendances,acceptTicketMessage,ticketHistory,saveDepartment,transferTicket,listDepartments} from '../server/tickets.js';import {canSeeLead} from '../server/conversation-access.js';
test('chamados independentes, duplicatas, mensagens atrasadas e transferências por setor',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');const db=new Pool({connectionString:url.toString()}),schema='tickets_'+crypto.randomBytes(8).toString('hex');await db.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const root=new PgStore(url.toString(),'.');
 try{
  await root.init();const store=root.scope('default'),phone='5511999000000',a={id:crypto.randomUUID(),name:'Ana'},b={id:crypto.randomUUID(),name:'Bruno'};
  for(const u of [a,b])await root.pool.query("INSERT INTO users(id,email,name,role) VALUES($1,$2,$3,'operator')",[u.id,u.id+'@qa.test',u.name]);
  const support=await saveDepartment(root,'default',{name:'Suporte',users:[a.id,b.id],connections:['default']}),sales=await saveDepartment(root,'default',{name:'Comercial',users:[b.id],connections:['default']});
  assert.equal((await listDepartments(root,'default','default')).length,2);
  await store.updateLead(phone,{nome:'Cliente',crmId:'123',temperatura:'quente'});
  const initial=(await store.getLead(phone)).ticketId;
  await store.transaction(tx=>acceptTicketMessage(tx,phone,'first',new Date().toISOString()));await store.recordEvent({id:'first',phone,direction:'in',text:'Primeiro assunto'});
  await transferTicket(store,phone,{departmentId:support.id},null,a);
  await transferTicket(store,phone,{departmentId:sales.id},b,a);
  await assert.rejects(transferTicket(store,phone,{departmentId:sales.id},a,a),/não está vinculado/);
  let lead=await store.getLead(phone);assert.equal(canSeeLead({...b,role:'operator',departmentIds:[sales.id]},lead),true);assert.equal(canSeeLead({...a,role:'operator',departmentIds:[support.id]},lead),false);
  await setConversationClosed(store,phone,true,a);
  await store.transaction(tx=>acceptTicketMessage(tx,phone,'late','2020-01-01T00:00:00Z'));assert.equal((await store.getLead(phone)).conversationClosed,true);
  await Promise.all(['new','new2'].map(id=>store.transaction(tx=>acceptTicketMessage(tx,phone,id,new Date(Date.now()+1000).toISOString()))));
  lead=await store.getLead(phone);assert.equal(lead.conversationClosed,false);assert.notEqual(lead.ticketId,initial);assert.equal(lead.crmId,'123');assert.equal(lead.temperatura,'quente');assert.equal(lead.assignedUserId,false);
  await store.recordEvent({id:'new',phone,direction:'in',text:'Segundo assunto'});
  let history=await ticketHistory(store,phone);assert.equal(history.length,2);assert.equal(history[1].transfers.length,2);assert.equal(history[1].transfers[1].actor_id,a.id);assert.ok(history[1].closed_at);assert.equal(history[0].closed_at,null);
  const messages=await store.getEvents(phone);assert.notEqual(messages.find(m=>m.id==='first').ticketId,messages.find(m=>m.id==='new').ticketId);
  await store.updateLead('5511000000000',{nome:'Contato importado sem atendimento'});
  const attendances=await listAttendances(store,{role:'admin'});assert.equal(attendances.length,2);assert.equal(attendances.filter(t=>t.conversationClosed).length,1);assert.equal(attendances.filter(t=>!t.conversationClosed).length,1);assert.equal(attendances.find(t=>t.conversationClosed).assignedUserId,b.id);assert.equal(attendances.find(t=>!t.conversationClosed).lastMessage,'Segundo assunto');assert.equal((await listAttendances(store,{...a,role:'operator',departmentIds:[support.id]})).length,1);
  await setConversationClosed(store,phone,true,a);await store.transaction(tx=>acceptTicketMessage(tx,phone,'new',new Date().toISOString()));assert.equal((await store.getLead(phone)).conversationClosed,true);
  await root.init();assert.equal((await ticketHistory(store,phone)).length,2);
  await assert.rejects(saveDepartment(root,'default',{name:'Invalid',users:[crypto.randomUUID()],connections:['default']}),/desta empresa/);
 }finally{await root.close();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();}
});
