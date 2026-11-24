import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';
import {AgendaService,requestsAppointmentReschedule} from '../server/agenda.js';
import {SalesAgent} from '../server/agent.js';
import {AppointmentReminders} from '../server/appointment-reminders.js';

test('reagendamento reconhece pedido e hora sem interpretar negação ou pergunta',()=>{
 for(const text of ['Precisar alterar a parte da tarde','Preciso mudar o horário','Quero reagendar','16 hs','16h','16:00','Pode ser 4 horas da tarde'])assert.equal(requestsAppointmentReschedule(text),true,text);
 for(const text of ['Não quero alterar o horário','Como mudar o horário?','Se eu mudar o horário?','Quero conhecer o sistema','Não precisa cancelar'])assert.equal(requestsAppointmentReschedule(text),false,text);
});

test('troca de reserva em atendimento humano verifica novo registro, cancelamento e lembretes sem envios reais',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');
 const db=new Pool({connectionString:url.toString()}),schema='reschedule_'+crypto.randomBytes(8).toString('hex');await db.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const store=new PgStore(url.toString(),'.');
 try{
  await store.init();await store.pool.query("UPDATE whatsapp_connections SET enabled=true WHERE id='default'");
  await store.pool.query("INSERT INTO agenda_settings(connection_id,enabled,procedure_id,technician_ids) VALUES('default',true,22,'{10}')");
  let now=new Date('2026-11-23T11:00:00Z'),nextId=500,deleteFails=false,slots=['09:00','14:00','16:00'];const remote=new Map(),calls=[];
  const api=async(url,options)=>{
   const path=new URL(url).pathname.slice('/api/integracao/agenda'.length),body=options.body?JSON.parse(options.body):null;
   calls.push({path,method:options.method});const response=(data,status=200)=>({ok:status<400,status,json:async()=>data});
   if(path==='/horarios')return response({duracaoMin:60,disponibilidade:[{data:'2026-11-23',tecnicoId:10,tecnicoNome:'Consultor QA',horarios:slots}]});
   if(path==='/agendamentos'&&options.method==='POST'){const data={...body,id:nextId++,duracaoMin:60,status:'ativo'};remote.set(data.id,data);return response(data,201);}
   const id=Number(path.split('/').pop());if(options.method==='DELETE'){if(deleteFails)return response({error:'Indisponível'},503);remote.get(id).status='cancelado';return response({ok:true});}
   return response(remote.get(id));
  };
  const agenda=new AgendaService(store,{agendaApiKey:'synthetic-only'},{fetchImpl:api,now:()=>now});
  const original=async phone=>{await store.updateLead(phone,{nome:'QA'});await agenda.consult('default',phone,{data_inicio:'2026-11-23',data_fim:'2026-11-23'},'offer-'+phone);await agenda.markSent('default',phone,'offer-'+phone);await agenda.intercept('default',phone,'1','pick-'+phone);await agenda.markSent('default',phone,'pick-'+phone);await agenda.intercept('default',phone,'confirmar','book-'+phone);return (await agenda.bookings('default',phone))[0];};
  const phone='5511999900500',old=await original(phone);assert.equal(old.option_data.horaInicio,'09:00');
  await store.pool.query("INSERT INTO appointment_reminder_settings(connection_id,enabled) VALUES('default',true)");
  const reminders=new AppointmentReminders(store,agenda,{now:()=>now});reminders.bind({});await reminders.process();
  await store.updateLead(phone,{status:'encaminhado',humanControlId:'synthetic-owner',assignedUserId:'synthetic-seller'});
  now=new Date('2026-11-23T13:00:00Z');const sent=[];let aiCalls=0;
  assert.equal(await agenda.managesExisting('default',phone,'Precisar alterar a parte da tarde'),true);
  const agent=new SalesAgent({config:{sellerNumbers:[],aiProvider:'deepseek'},store:store.scope('default'),agenda,providerFactory:()=>{aiCalls++;throw Error('A IA comercial não deve retomar');},whatsapp:{markRead:async()=>{},sendText:async(_,text)=>sent.push(text),sendInteractive:async(_,text)=>sent.push(text)}});
  await agent.handle({id:'change-afternoon',from:phone,text:'Precisar alterar a parte da tarde'});
  assert.match(sent.at(-1),/14:00/);assert.equal(remote.get(Number(old.remote_id)).status,'ativo');
  await agent.handle({id:'change-16',from:phone,text:'16 hs'});assert.match(sent.at(-1),/16:00/);assert.match(sent.at(-1),/CONFIRMAR/);assert.equal(remote.size,1);
  await agent.handle({id:'change-confirm',from:phone,text:'Confirmar'});
  assert.match(sent.at(-1),/16:00/);assert.match(sent.at(-1),/confirmada/);assert.equal(remote.get(Number(old.remote_id)).status,'cancelado');
  const bookings=await agenda.bookings('default',phone),fresh=bookings.find(b=>b.id!==old.id);assert.equal(fresh.status,'confirmed');assert.equal(fresh.rescheduled_from,old.id);assert.equal(bookings.find(b=>b.id===old.id).status,'cancelled');
  const lead=await store.getLead(phone);assert.equal(lead.status,'encaminhado');assert.equal(lead.humanControlId,'synthetic-owner');assert.equal(lead.assignedUserId,'synthetic-seller');assert.equal(lead.needsAgendaReschedule,false);assert.equal(aiCalls,0);
  await reminders.process();const reminderRows=(await store.pool.query('SELECT booking_id,status FROM appointment_reminders WHERE phone=$1',[phone])).rows;assert.equal(reminderRows.find(r=>r.booking_id===old.id).status,'skipped');assert.equal(reminderRows.find(r=>r.booking_id===fresh.id).status,'pending');
  const posts=calls.filter(c=>c.method==='POST').length;await agent.handle({id:'change-confirm',from:phone,text:'Confirmar'});assert.equal(calls.filter(c=>c.method==='POST').length,posts);
  now=new Date('2026-11-23T11:00:00Z');const failurePhone='5511999900501',failureOld=await original(failurePhone);now=new Date('2026-11-23T13:00:00Z');
  slots=['14:00'];let result=await agenda.intercept('default',failurePhone,'Mudar para 16 hs','unavailable');assert.match(result.reply,/não foi cancelada/);assert.equal(remote.get(Number(failureOld.remote_id)).status,'ativo');
  slots=['16:00'];await agenda.intercept('default',failurePhone,'16 hs','failure-pick');await agenda.markSent('default',failurePhone,'failure-pick');deleteFails=true;
  result=await agenda.intercept('default',failurePhone,'Confirmar','failure-confirm');assert.match(result.reply,/conferir/);assert.equal(remote.get(Number(failureOld.remote_id)).status,'ativo');const uncertain=(await agenda.bookings('default',failurePhone)).find(b=>b.status==='uncertain');assert.ok(uncertain);
  const count=remote.size;await agenda.intercept('default',failurePhone,'16 hs','failure-retry');assert.equal(remote.size,count);
  deleteFails=false;await agenda.review('default',uncertain.id,{resolution:'confirmed',remoteId:Number(uncertain.remote_id)},null);assert.equal(remote.get(Number(failureOld.remote_id)).status,'cancelado');assert.equal((await agenda.bookings('default',failurePhone)).find(b=>b.id===uncertain.id).status,'confirmed');
 }finally{await store.close();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();}
});
