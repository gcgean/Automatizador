import crypto from 'node:crypto';
import {matchesBooking} from './agenda.js';
export const REMINDER_TEMPLATE='lembrete_apresentacao_30min_v1';
export const REMINDER_BODY='Olá! Sua apresentação com nossa equipe está agendada para {{1}}, às {{2}} (horário de Brasília). Passando para lembrar do nosso encontro. Se precisar alterar o horário, responda por aqui.';
const appointmentTime=o=>new Date(o.data+'T'+o.horaInicio+':00-03:00');
const reminderDate=o=>o.data.slice(8,10)+'/'+o.data.slice(5,7)+'/'+o.data.slice(0,4);
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export class AppointmentReminders{
 constructor(store,agenda,{fetchImpl=fetch,now=()=>new Date(),log=console}={}){this.store=store;this.agenda=agenda;this.fetch=fetchImpl;this.now=now;this.log=log;}
 bind(registry){this.registry=registry;}
 async init(){
  await this.store.pool.query("UPDATE appointment_reminders SET status='uncertain',reason='Execução interrompida durante envio. Conferir antes de reenviar.',updated_at=now() WHERE status='sending'");
  await this.store.pool.query("UPDATE appointment_reminders SET status='pending',next_check_at=now(),updated_at=now() WHERE status='checking'");
 }
 start(){this.timer=setInterval(()=>this.tick().catch(()=>this.log.error('[lembretes] Falha ao conferir apresentações.')),30000);this.timer.unref();}
 async close(){clearInterval(this.timer);await this.current;}
 async settings(id){return (await this.store.pool.query('SELECT * FROM appointment_reminder_settings WHERE connection_id=$1',[id])).rows[0]||{connection_id:id,enabled:false,activation_pending:false,template_name:REMINDER_TEMPLATE,language:'pt_BR'};}
 async approvedTemplate(id,settings){
  const c=await this.registry.configFor(id),url=new URL('https://graph.facebook.com/'+c.graphVersion+'/'+c.wabaId+'/message_templates');
  url.searchParams.set('name',settings.template_name);url.searchParams.set('fields','name,status,language,category,components');
  const r=await this.fetch(url,{headers:{Authorization:'Bearer '+c.accessToken},signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw fail('Não foi possível verificar o modelo de lembrete na Meta.',502);
  const data=await r.json();return (data.data||[]).find(t=>t.name===settings.template_name&&t.language===settings.language&&t.category==='UTILITY'&&t.status==='APPROVED'&&t.components?.filter(x=>x.type==='BODY').length===1&&t.components.find(x=>x.type==='BODY').text===REMINDER_BODY&&!t.components.some(x=>!['BODY','FOOTER'].includes(x.type)));
 }
 async configure(id,body,userId=null){
  if(typeof body.enabled!=='boolean')throw fail('Informe se o lembrete está ativado.');
  const settings={enabled:body.enabled,template_name:REMINDER_TEMPLATE,language:'pt_BR'};
  const approved=!settings.enabled||!!await this.approvedTemplate(id,settings),pending=settings.enabled&&!approved;
  if(pending&&body.waitForApproval!==true)throw fail('O modelo de lembrete ainda precisa ser aprovado pela Meta.');
  await this.store.pool.query('INSERT INTO appointment_reminder_settings(connection_id,enabled,template_name,language,activation_pending) VALUES($1,$2,$3,$4,$5) ON CONFLICT(connection_id) DO UPDATE SET enabled=excluded.enabled,template_name=excluded.template_name,language=excluded.language,activation_pending=excluded.activation_pending,updated_at=now()',[id,settings.enabled&&approved,settings.template_name,settings.language,pending]);
  await this.store.scope(id).audit('appointment_reminders_configured',userId,{enabled:settings.enabled&&approved,activationPending:pending,minutesBefore:30});return this.settings(id);
 }
 async list(id){return (await this.store.pool.query('SELECT id,booking_id,phone,appointment_at,due_at,status,reason,message_id,updated_at FROM appointment_reminders WHERE connection_id=$1 ORDER BY created_at DESC LIMIT 100',[id])).rows;}
 tick(){if(this.running)return this.current;this.running=true;this.current=this.process().finally(()=>{this.running=false;});return this.current;}
 async process(){
  if(!this.registry)return;
  const awaiting=(await this.store.pool.query('SELECT s.* FROM appointment_reminder_settings s JOIN whatsapp_connections c ON c.id=s.connection_id JOIN companies e ON e.id=c.company_id WHERE s.activation_pending AND c.enabled AND e.active LIMIT 10')).rows;
  for(const s of awaiting)try{if(await this.approvedTemplate(s.connection_id,s)){
   const changed=await this.store.pool.query('UPDATE appointment_reminder_settings SET enabled=true,activation_pending=false,updated_at=now() WHERE connection_id=$1 AND activation_pending RETURNING connection_id',[s.connection_id]);
   if(changed.rowCount)await this.store.scope(s.connection_id).audit('appointment_reminders_auto_activated',null,{minutesBefore:30});
  }}catch{this.log.error('[lembretes] Não foi possível conferir a aprovação de um modelo pendente.');}
  // Schedule only reservations already confirmed by the integration. Never import unrelated agenda entries.
  const bookings=(await this.store.pool.query(`SELECT b.* FROM agenda_bookings b JOIN whatsapp_connections c ON c.id=b.connection_id JOIN companies e ON e.id=c.company_id JOIN appointment_reminder_settings s ON s.connection_id=c.id WHERE b.status='confirmed' AND b.cancellation_requested_at IS NULL AND b.reschedule_requested_at IS NULL AND s.enabled AND c.enabled AND e.active AND NOT EXISTS(SELECT 1 FROM appointment_reminders r WHERE r.booking_id=b.id) AND ((b.option_data->>'data')::date+(b.option_data->>'horaInicio')::time) AT TIME ZONE 'America/Sao_Paulo'>$1 ORDER BY b.created_at LIMIT 100`,[this.now()])).rows;
  for(const b of bookings){const at=appointmentTime(b.option_data),due=new Date(at.getTime()-30*60000);await this.store.pool.query(`INSERT INTO appointment_reminders(id,booking_id,connection_id,phone,appointment_at,due_at,next_check_at) VALUES($1,$2,$3,$4,$5,$6,$6) ON CONFLICT(booking_id) DO NOTHING`,[crypto.randomUUID(),b.id,b.connection_id,b.phone,at,due]);}
  const rows=(await this.store.pool.query("SELECT id,connection_id,phone FROM appointment_reminders WHERE status='pending' AND next_check_at<=$1 ORDER BY next_check_at LIMIT 30",[this.now()])).rows;
  for(const r of rows){const runtime=await this.registry.runtime(r.connection_id);await runtime.agent.enqueue({id:'appointment-reminder-'+r.id,from:r.phone,appointmentReminder:{id:r.id}});}
 }
 async state(id,status,reason,messageId=null){await this.store.pool.query('UPDATE appointment_reminders SET status=$2,reason=$3,message_id=COALESCE($4,message_id),updated_at=now() WHERE id=$1',[id,status,reason,messageId]);}
 async deliver(agent,phone,id){
  const row=(await this.store.pool.query("UPDATE appointment_reminders SET status='checking',updated_at=now() WHERE id=$1 AND connection_id=$2 AND phone=$3 AND status='pending' AND due_at<=$4 AND next_check_at<=$4 RETURNING *",[id,agent.store.connectionId,phone,this.now()])).rows[0];if(!row)return null;
  let sending=false;
  try{
   const skip=async reason=>{await this.state(id,'skipped',reason);return null;};
   if(this.now().getTime()>new Date(row.due_at).getTime()+5*60000||this.now()>=new Date(row.appointment_at))return skip('Horário do lembrete ultrapassado. Não enviar aviso atrasado.');
   const settings=await this.settings(row.connection_id),connection=await this.store.getConnection(row.connection_id),lead=await agent.store.getLead(phone);
   if(!settings.enabled||!connection.enabled||!connection.company_active||!lead||lead.optedOut||lead.resultado==='perdido')return skip('Lembrete desativado, empresa/conexão pausada ou contato bloqueado.');
   const booking=(await this.store.pool.query("SELECT * FROM agenda_bookings WHERE id=$1 AND connection_id=$2 AND phone=$3 AND status='confirmed' AND cancellation_requested_at IS NULL AND reschedule_requested_at IS NULL",[row.booking_id,row.connection_id,phone])).rows[0];
   const agendaSettings=await this.agenda.settings(row.connection_id);
   if(!booking||!agendaSettings.enabled)return skip('Reserva não confirmada ou agenda desativada.');
   const remote=(await this.agenda.call(agendaSettings,'/agendamentos/'+booking.remote_id)).data;
   if(String(remote?.id)!==String(booking.remote_id)||!matchesBooking(remote,booking.option_data,booking.id)||appointmentTime(booking.option_data).getTime()!==new Date(row.appointment_at).getTime())return skip('Reserva cancelada ou alterada na agenda. Não lembrar o horário anterior.');
   const runtime=await this.registry.runtime(row.connection_id);
   if(Object.values(runtime.inbox.jobs).some(j=>j.message.from===phone&&j.status==='attention'))return skip('Há um envio incerto neste contato. Conferir antes de outro envio.');
   const events=await agent.store.getEvents(phone),last=events.filter(e=>e.direction==='in').at(-1),inWindow=last&&this.now()-new Date(last.at)<86400000&&this.now()>=new Date(last.at);
   if(!inWindow&&!await this.approvedTemplate(row.connection_id,settings))return skip('Modelo de lembrete não está aprovado para envio fora da janela de atendimento.');
   const fresh=await agent.store.getLead(phone),cfg=await this.registry.configFor(row.connection_id),freshSettings=await this.settings(row.connection_id);
   const cancellation=(await this.store.pool.query('SELECT cancellation_requested_at,reschedule_requested_at FROM agenda_bookings WHERE id=$1',[row.booking_id])).rows[0];
   if(cancellation?.cancellation_requested_at||cancellation?.reschedule_requested_at||!fresh||fresh.optedOut||fresh.resultado==='perdido'||!cfg.enabled||!freshSettings.enabled)return skip('Estado do contato, conexão ou lembrete mudou antes do envio.');
   if(this.now().getTime()>new Date(row.due_at).getTime()+5*60000)return skip('Horário do lembrete ultrapassado durante a conferência.');
   const date=reminderDate(booking.option_data),time=booking.option_data.horaInicio,text=REMINDER_BODY.replace('{{1}}',date).replace('{{2}}',time),metadata={actor:'ai',provider:'agenda-reminder',appointmentReminderId:id};
   await this.state(id,'sending','Envio iniciado.');sending=true;
   const result=inWindow?await agent.whatsapp.sendText(phone,text,metadata):await agent.whatsapp.sendTemplate(phone,{name:settings.template_name,language:{code:settings.language},components:[{type:'body',parameters:[{type:'text',text:date},{type:'text',text:time}]}]},text,metadata);
   if(!result?.messages?.[0]?.id)throw Error('Identificador de envio ausente.');
   await this.state(id,'accepted','Meta aceitou o envio. Entrega depende da confirmação do WhatsApp.',result.messages[0].id);
   // A history write failure after acceptance must never turn the reminder back into a pending send.
   try{const conv=await agent.store.getConversation(phone),provider=(await agent.store.getSettings()).aiProvider||agent.config.aiProvider;
    (conv.histories[provider]??=[]).push({role:'assistant',content:text});await agent.store.saveConversation(conv);
   }catch{this.log.error('[lembretes] Envio aceito, mas o histórico da IA precisa ser conferido.');}
   return text;
  }catch(error){
   if(sending){await this.state(id,'uncertain','Não foi possível confirmar o envio. Não repetir automaticamente.');return null;}
   await this.store.pool.query("UPDATE appointment_reminders SET status='pending',reason='Não foi possível conferir a agenda. Tentar novamente antes do limite.',next_check_at=$2,updated_at=now() WHERE id=$1",[id,new Date(this.now().getTime()+60000)]);return null;
  }
 }
}
