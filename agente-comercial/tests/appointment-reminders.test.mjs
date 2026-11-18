import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';
import {AgendaService} from '../server/agenda.js';
import {ConnectionRegistry} from '../server/connections.js';
import {AppointmentReminders,REMINDER_BODY,REMINDER_TEMPLATE} from '../server/appointment-reminders.js';
const database=process.env.TEST_DATABASE_URL;
test('lembrete de apresentação: 30 minutos, reserva real, janela Meta, isolamento e envio único',{skip:!database},async t=>{
 const url=new URL(database);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');
 const db=new Pool({connectionString:database}),schema='reminder_'+crypto.randomBytes(8).toString('hex');await db.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);
 const root=new PgStore(url.toString(),'.');let reminders;
 try{
  await root.init();const BASE=new Date('2026-11-20T12:00:00Z');let now=new Date(BASE),sendFail=false,agendaFail=false,approved=true,seq=0;
  const sent=[],remote=new Map(),cfg={aiProvider:'deepseek',panelOnly:true,sellerNumbers:[],agendaApiKey:'ca_'+'a'.repeat(48),connectionsKey:'b'.repeat(64)};
  const transport=async(url,options)=>{
   if(String(url).includes('/message_templates'))return {ok:true,json:async()=>({data:[{name:REMINDER_TEMPLATE,language:'pt_BR',category:'UTILITY',status:approved?'APPROVED':'PENDING',components:[{type:'BODY',text:REMINDER_BODY}]}]})};
   const body=JSON.parse(options.body);assert.equal(body.messaging_product,'whatsapp');sent.push(body);if(sendFail)throw Error('Simulação de resposta incerta');return {ok:true,json:async()=>({messages:[{id:'wamid.test-'+sent.length}]})};
  };
  const agenda=new AgendaService(root,cfg,{now:()=>now,fetchImpl:async url=>{if(agendaFail)throw Error('Agenda indisponível');const data=remote.get(Number(String(url).split('/').at(-1)));return {ok:!!data,status:data?200:404,json:async()=>data||{error:'Não encontrado'}};}});
  reminders=new AppointmentReminders(root,agenda,{now:()=>now,fetchImpl:transport});await reminders.init();
  const registry=new ConnectionRegistry(root,cfg,{agenda,reminders,fetchImpl:transport});
  registry.configFor=async id=>{const c=await root.getConnection(id);return {...cfg,connectionId:id,enabled:c.enabled&&c.company_active,accessToken:'test-only',phoneNumberId:'12345',wabaId:'67890',graphVersion:'v23.0'};};reminders.bind(registry);
  const context=await root.saveContext('default','Contexto QA','Contexto sintético');await root.pool.query("UPDATE whatsapp_connections SET enabled=true,context_id=$1 WHERE id='default'",[context.id]);
  await root.pool.query("INSERT INTO agenda_settings(connection_id,enabled) VALUES('default',true)");await reminders.configure('default',{enabled:true});
  async function seed({inWindow=true,optedOut=false,remoteStatus='ativo',changed=false}={}){
   now=new Date(BASE);const n=++seq,phone='551199990'+String(n).padStart(4,'0'),offerId=crypto.randomUUID(),bookingId=crypto.randomUUID(),option={id:crypto.randomUUID(),tecnicoId:10,tecnicoNome:'Apresentador QA',procedimentoId:22,data:'2026-11-20',horaInicio:'09:30',duracaoMin:60};
   await root.updateLead(phone,{nome:'Contato fictício',resultado:'apresentacao_agendada',optedOut});await root.recordEvent({id:'in-'+n,phone,direction:'in',actor:'client',text:'Confirmo minha apresentação.',at:new Date(BASE.getTime()-(inWindow?3600000:2*86400000)).toISOString()});
   await root.pool.query('INSERT INTO agenda_offers(id,connection_id,phone,inbound_id,options,config_version,expires_at) VALUES($1,$2,$3,$4,$5,1,$6)',[offerId,'default',phone,'offer-'+n,JSON.stringify([option]),BASE]);
   await root.pool.query("INSERT INTO agenda_bookings(id,connection_id,phone,inbound_id,offer_id,option_data,status,remote_id) VALUES($1,'default',$2,$3,$4,$5,'confirmed',$6)",[bookingId,phone,'confirm-'+n,offerId,option,n]);
   remote.set(n,{...option,id:n,horaInicio:changed?'10:00':option.horaInicio,status:remoteStatus,descricao:'Ref HELENA-'+bookingId});return {phone,bookingId,option,n};
  }
  const state=async b=>(await root.pool.query('SELECT * FROM appointment_reminders WHERE booking_id=$1',[b.bookingId])).rows[0];
  await t.test('não antecipa, envia aos 30 minutos e não duplica, mesmo com execuções simultâneas',async()=>{
   const b=await seed(),prior=sent.length;now=new Date(BASE.getTime()-60000);await reminders.tick();assert.equal(sent.length,prior);assert.equal((await state(b)).status,'pending');
   now=new Date(BASE);await Promise.all([reminders.tick(),reminders.tick()]);assert.equal(sent.length,prior+1);assert.equal(sent.at(-1).type,'text');assert.match(sent.at(-1).text.body,/20\/11\/2026, às 09:30/);assert.equal((await state(b)).status,'accepted');await reminders.tick();assert.equal(sent.length,prior+1);
   const events=await root.getEvents(b.phone);assert.equal(events.filter(e=>e.direction==='in').length,1);assert.ok(events.some(e=>e.provider==='agenda-reminder'));assert.match(JSON.stringify((await root.getConversation(b.phone)).histories),/apresentação/);
  });
  await t.test('usa modelo utility com data e hora fora da janela, sem exigir consentimento de marketing',async()=>{
   const b=await seed({inWindow:false}),prior=sent.length;await reminders.tick();assert.equal(sent.length,prior+1);const body=sent.at(-1);assert.equal(body.type,'template');assert.equal(body.template.name,REMINDER_TEMPLATE);assert.deepEqual(body.template.components[0].parameters.map(p=>p.text),['20/11/2026','09:30']);assert.equal((await state(b)).status,'accepted');
  });
  await t.test('cancelamento, mudança externa e descadastro impedem o lembrete',async()=>{
   for(const options of [{remoteStatus:'cancelado'},{changed:true},{optedOut:true}]){const b=await seed(options),prior=sent.length;await reminders.tick();assert.equal(sent.length,prior);assert.equal((await state(b)).status,'skipped');}
  });
  await t.test('falha ao consultar agenda permite nova conferência, sem envio prematuro',async()=>{
   const b=await seed(),prior=sent.length;agendaFail=true;await reminders.tick();assert.equal(sent.length,prior);assert.equal((await state(b)).status,'pending');agendaFail=false;now=new Date(BASE.getTime()+60000);await reminders.tick();assert.equal(sent.length,prior+1);assert.equal((await state(b)).status,'accepted');
  });
  await t.test('envio incerto não repete, inclusive depois de reiniciar o serviço',async()=>{
   const b=await seed(),prior=sent.length;sendFail=true;await reminders.tick();assert.equal(sent.length,prior+1);assert.equal((await state(b)).status,'uncertain');sendFail=false;await reminders.init();await reminders.tick();assert.equal(sent.length,prior+1);assert.equal((await state(b)).status,'uncertain');
  });
  await t.test('modelo não aprovado fora da janela não gera envio livre',async()=>{
   const b=await seed({inWindow:false}),prior=sent.length;approved=false;await reminders.tick();assert.equal(sent.length,prior);assert.equal((await state(b)).status,'skipped');await assert.rejects(reminders.configure('default',{enabled:true}),/aprovado/);approved=true;
  });
  await t.test('recuperação tardia não envia aviso fora do prazo',async()=>{
   const b=await seed(),prior=sent.length;now=new Date(BASE.getTime()+6*60000);await reminders.tick();assert.equal(sent.length,prior);assert.equal((await state(b)).status,'skipped');
  });
  await t.test('empresa suspensa bloqueia lembrete pendente e não altera outras conexões',async()=>{
   const b=await seed(),prior=sent.length;now=new Date(BASE.getTime()-60000);await reminders.tick();await root.pool.query("UPDATE companies SET active=false WHERE id='default'");now=new Date(BASE);await reminders.tick();assert.equal(sent.length,prior);assert.equal((await state(b)).status,'skipped');await root.pool.query("UPDATE companies SET active=true WHERE id='default'");
   const row=await state(b),runtime=await registry.runtime('default');await reminders.deliver(runtime.agent,'5511999999999',row.id);assert.equal(sent.length,prior);
  });
  await t.test('outra empresa ou telefone não consegue executar o lembrete e o banco protege o vínculo',async()=>{
   const b=await seed(),prior=sent.length;now=new Date(BASE.getTime()-60000);await reminders.tick();const row=await state(b);
   await root.pool.query("INSERT INTO companies(id,name) VALUES('reminder-other','Outra empresa QA')");
   await root.pool.query("INSERT INTO whatsapp_connections(id,name,company_id,enabled) VALUES('reminder-other-connection','Outro número QA','reminder-other',true)");
   now=new Date(BASE);const other=await registry.runtime('reminder-other-connection');await reminders.deliver(other.agent,b.phone,row.id);
   const own=await registry.runtime('default');await reminders.deliver(own.agent,'5511999999999',row.id);assert.equal(sent.length,prior);assert.equal((await state(b)).status,'pending');
   await assert.rejects(root.pool.query("UPDATE appointment_reminders SET phone='5511999999999' WHERE id=$1",[row.id]),e=>e.code==='23503');
   await reminders.tick();assert.equal(sent.length,prior+1);
  });
  await t.test('reinício durante envio exige conferência e nunca repete automaticamente',async()=>{
   const b=await seed(),prior=sent.length;now=new Date(BASE.getTime()-60000);await reminders.tick();const row=await state(b);
   await root.pool.query("UPDATE appointment_reminders SET status='sending' WHERE id=$1",[row.id]);await reminders.init();now=new Date(BASE);await reminders.tick();assert.equal(sent.length,prior);assert.equal((await state(b)).status,'uncertain');
  });
  await t.test('desistência recebida antes do lembrete interrompe o envio e encaminha liberação externa',async()=>{
   const b=await seed(),prior=sent.length;now=new Date(BASE.getTime()-60000);await reminders.tick();
   const runtime=await registry.runtime('default');await agenda.suppressRemindersFromMessage('default',b.phone,'Não precisa mais obrigado','cancel-in');
   now=new Date(BASE);await reminders.tick();assert.equal(sent.length,prior);assert.equal((await state(b)).status,'skipped');
   const reply=await agenda.cancelFromMessage('default',b.phone,'Não precisa mais obrigado','cancel-in');assert.match(reply.reply,/equipe vai conferir/);assert.equal((await root.getLead(b.phone)).agendamentoStatus,'cancelamento_solicitado');
   const booked=(await root.pool.query('SELECT status,cancellation_requested_at FROM agenda_bookings WHERE id=$1',[b.bookingId])).rows[0];assert.equal(booked.status,'confirmed');assert.ok(booked.cancellation_requested_at);
  });
  await t.test('pedido de ativação aguarda aprovação de forma persistente e pode ser cancelado',async()=>{
   approved=false;const settings=await reminders.configure('default',{enabled:true,waitForApproval:true});assert.equal(settings.enabled,false);assert.equal(settings.activation_pending,true);
   await reminders.tick();assert.equal((await reminders.settings('default')).enabled,false);
   await reminders.configure('default',{enabled:false});approved=true;await reminders.tick();assert.equal((await reminders.settings('default')).enabled,false);
   approved=false;await reminders.configure('default',{enabled:true,waitForApproval:true});approved=true;await reminders.tick();assert.equal((await reminders.settings('default')).enabled,true);assert.equal((await reminders.settings('default')).activation_pending,false);
  });
 }finally{await reminders?.close();await root.close();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();}
});
