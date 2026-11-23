import crypto from 'node:crypto';
import {companyOf,systemReason,recordClosureReasons,NO_INTERACTION_NAME} from './closure-reasons.js';
import {cadenceAttemptRecords,attemptedSend,deliveredAttempt} from './cadence-report.js';
export const NO_RESPONSE_TAG='Finalizado por falta de resposta do lead';
export async function completeCadences(service){
 const rows=(await service.store.pool.query("SELECT q.* FROM cadence_queue q JOIN whatsapp_connections c ON c.id=q.connection_id JOIN companies e ON e.id=c.company_id JOIN cadence_settings s ON s.connection_id=q.connection_id WHERE q.status IN ('awaiting_response','awaiting_delivery') AND q.next_at<=$1 AND c.enabled AND e.active AND s.enabled ORDER BY q.next_at LIMIT 20",[service.now()])).rows;
 for(const candidate of rows){const runtime=await service.registry.runtime(candidate.connection_id);if(Object.values(runtime.inbox.jobs).some(j=>j.message.from===candidate.phone&&['queued','processing','attention'].includes(j.status)))continue;
  await service.store.scope(candidate.connection_id).transaction(async tx=>{
   await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))',['tags:'+candidate.connection_id]);
   const {rows:[l]}=await tx.pool.query('SELECT data FROM leads WHERE connection_id=$1 AND phone=$2 FOR UPDATE',[candidate.connection_id,candidate.phone]);
   const {rows:[q]}=await tx.pool.query('SELECT * FROM cadence_queue WHERE connection_id=$1 AND phone=$2 FOR UPDATE',[candidate.connection_id,candidate.phone]);
   if(!q||q.cycle_id!==candidate.cycle_id||!['awaiting_response','awaiting_delivery'].includes(q.status)||new Date(q.next_at)>service.now())return;
   const connection=await tx.getConnection(),settings=(await tx.pool.query('SELECT * FROM cadence_settings WHERE connection_id=$1 FOR SHARE',[candidate.connection_id])).rows[0];
   const stop=async reason=>tx.pool.query("UPDATE cadence_queue SET status='stopped',reason=$3,updated_at=now() WHERE connection_id=$1 AND phone=$2",[candidate.connection_id,candidate.phone,reason]);
   if(!connection.enabled||!connection.company_active||!settings?.enabled)return;
   if(!service.allowed(l?.data)){await stop('Estado do atendimento mudou; não finalizado automaticamente');return;}
   if(service.registry.growth&&(await tx.pool.query("SELECT 1 FROM commercial_events WHERE connection_id=$1 AND phone=$2 AND kind IN ('signup_completed','trial_started','activation_completed','subscription_started') LIMIT 1",[candidate.connection_id,candidate.phone])).rowCount){await stop('Cadastro ou uso confirmado; acompanhamento comercial permanece aberto');return;}
   const history=(await cadenceAttemptRecords(tx,candidate.connection_id,[candidate.phone])).filter(a=>a.cycle_id===q.cycle_id),sends=history.filter(attemptedSend),last=sends[0];
   if(q.attempts<settings.max_attempts){await tx.pool.query("UPDATE cadence_queue SET status='waiting',next_at=$3,reason='Limite de tentativas ampliado',updated_at=now() WHERE connection_id=$1 AND phone=$2",[candidate.connection_id,candidate.phone,new Date(service.now().getTime()+86400000)]);return;}
   const response=await tx.pool.query("SELECT 1 FROM messages WHERE connection_id=$1 AND phone=$2 AND direction='in' AND occurred_at>$3 LIMIT 1",[candidate.connection_id,candidate.phone,last?.attempted_at||q.updated_at]);
   if(response.rowCount){await stop('Cliente respondeu');return;}
   if(!last||sends.length<settings.max_attempts||last.delivery_status==='failed'||last.message_state==='uncertain'||history.some(a=>a.status==='uncertain'||a.status==='sending')){await tx.pool.query("UPDATE cadence_queue SET status='uncertain',reason='Confira as tentativas: falha ou envio sem confirmação',updated_at=now() WHERE connection_id=$1 AND phone=$2",[candidate.connection_id,candidate.phone]);return;}
   if(!deliveredAttempt(last)){await tx.pool.query("UPDATE cadence_queue SET status='awaiting_delivery',next_at=$3,reason='Limite atingido; aguardando confirmação de entrega da última tentativa',updated_at=now() WHERE connection_id=$1 AND phone=$2",[candidate.connection_id,candidate.phone,new Date(service.now().getTime()+3600000)]);return;}
   const stamp=Number(last.delivery_timestamp),deliveryAt=stamp>0?new Date(stamp*1000):last.delivery_updated_at||last.accepted_at||last.attempted_at,deadline=new Date(Math.max(new Date(last.accepted_at||last.attempted_at).getTime(),new Date(deliveryAt).getTime())+86400000);
   if(service.now()<deadline){await tx.pool.query("UPDATE cadence_queue SET status='awaiting_response',next_at=$3,reason='Aguardando resposta à última tentativa',updated_at=now() WHERE connection_id=$1 AND phone=$2",[candidate.connection_id,candidate.phone,deadline]);return;}
   // Preserve existing tags, qualification, CRM, result and opt-in. This is only a local conversation closure.
   const tag=(await tx.pool.query("INSERT INTO contact_tags(id,connection_id,name,color) VALUES($1,$2,$3,'gray') ON CONFLICT(connection_id,lower(name)) DO UPDATE SET name=excluded.name RETURNING id",[crypto.randomUUID(),candidate.connection_id,NO_RESPONSE_TAG])).rows[0];
   await tx.pool.query("INSERT INTO lead_tags(connection_id,phone,tag_id,source) VALUES($1,$2,$3,'cadence_no_response') ON CONFLICT DO NOTHING",[candidate.connection_id,candidate.phone,tag.id]);
   await tx.updateLead(candidate.phone,{conversationClosed:true,conversationClosedAt:service.now().toISOString(),conversationClosedBy:'cadence',conversationClosedByName:'Cadência',conversationClosedReason:'cadence_no_response',conversationClosedReasonNames:[NO_INTERACTION_NAME],cadenceNoResponseTagId:tag.id,humanControlId:crypto.randomUUID()});
   await recordClosureReasons(tx.pool,l.data.ticketId,[await systemReason(tx.pool,await companyOf(tx.pool,candidate.connection_id))]);
   await tx.pool.query("UPDATE cadence_queue SET status='completed',finalized_at=$3,next_at=NULL,reason=$4,updated_at=now() WHERE connection_id=$1 AND phone=$2",[candidate.connection_id,candidate.phone,service.now(),NO_RESPONSE_TAG]);await tx.audit('cadence_completed_no_response',null,{phone:candidate.phone,cycleId:q.cycle_id,attempts:q.attempts,tagId:tag.id});
  });
 }
}
