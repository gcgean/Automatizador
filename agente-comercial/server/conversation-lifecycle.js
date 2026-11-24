import crypto from 'node:crypto';
import {companyOf,validateClosureReasons,recordClosureReasons,systemReason,SYSTEM_REASONS} from './closure-reasons.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export async function clearNoResponseTag(store,phone,lead){
 if(lead.conversationClosedReason!=='cadence_no_response'||!lead.cadenceNoResponseTagId)return;
 await store.pool.query("DELETE FROM lead_tags WHERE connection_id=$1 AND phone=$2 AND tag_id=$3 AND source='cadence_no_response'",[store.connectionId,phone,lead.cadenceNoResponseTagId]);
 await store.updateLead(phone,{cadenceNoResponseTagId:false,conversationClosedReason:false});
}
export async function setConversationClosed(store,phone,closed,user,jobs={},expectedTicketId=null,reasonIds=[],note=''){
 if(typeof closed!=='boolean')throw fail('Informe se deseja finalizar ou reabrir a conversa.');
 if(closed&&(typeof note!=='string'||note.length>2000))throw fail('A observação deve ter até 2.000 caracteres.');
 if(closed&&Object.values(jobs).some(j=>j.message.from===phone&&(j.status==='attention'||j.message.manual&&['queued','processing'].includes(j.status))))throw fail('Confira os envios pendentes deste contato antes de finalizar a conversa.',409);
 return store.transaction(async tx=>{
  const {rows:[row]}=await tx.pool.query('SELECT data FROM leads WHERE connection_id=$1 AND phone=$2 FOR UPDATE',[store.connectionId,phone]);if(!row)throw fail('Contato não encontrado.',404);if(expectedTicketId&&String(row.data.ticketId)!==String(expectedTicketId))throw fail('O chamado mudou. Atualize a tela antes de continuar.',409);
  if((row.data.conversationClosed===true)===closed)return row.data;
  const reasons=closed?await validateClosureReasons(tx.pool,await companyOf(tx.pool,store.connectionId),reasonIds):[];
  const at=new Date().toISOString(),patch={conversationClosed:closed,humanControlId:crypto.randomUUID(),...(closed?{conversationClosedAt:at,conversationClosedBy:user.id,conversationClosedByName:user.name||user.email}:{conversationReopenedAt:at,conversationReopenedBy:user.id,conversationClosedReasonNames:false})};
  if(!closed){await clearNoResponseTag(tx,phone,row.data);patch.conversationClosedNote=false;patch.conversationClosureAdId=false;}
  if(closed){
   patch.conversationClosedReason='manual';patch.conversationClosedReasonNames=reasons.map(r=>r.name);patch.conversationClosedNote=note.trim()||false;
   const attribution=(await tx.pool.query('SELECT source_id FROM meta_ad_attribution WHERE connection_id=$1 AND phone=$2 AND occurred_at<=now()',[store.connectionId,phone])).rows[0];
   patch.conversationClosureAdId=attribution?.source_id||false;
  }
  await tx.pool.query("SELECT set_config('app.ticket_actor',$1,true)",[user.id]);
  const lead=await tx.updateLead(phone,patch);
  if(closed)await recordClosureReasons(tx.pool,row.data.ticketId,reasons.map(r=>r.id),user.id);
  if(closed)await tx.pool.query("UPDATE cadence_queue SET status='stopped',reason='Conversa finalizada pela equipe',updated_at=now() WHERE connection_id=$1 AND phone=$2 AND status IN ('waiting','queued','consent_required','awaiting_response','awaiting_delivery')",[store.connectionId,phone]);
  await tx.audit(closed?'conversation_closed':'conversation_reopened',user.id,closed?{phone,reasons:reasons.map(r=>r.name)}:{phone});return lead;
 });
}
// A IA finaliza quando o cliente recusa de forma clara; grava o motivo no chamado e para a cadência.
export async function closeConversationBySystem(store,phone,key){
 return store.transaction(async tx=>{
  const {rows:[row]}=await tx.pool.query('SELECT data FROM leads WHERE connection_id=$1 AND phone=$2 FOR UPDATE',[store.connectionId,phone]);if(!row||row.data.conversationClosed)return row?.data||null;
  const reasonId=await systemReason(tx.pool,await companyOf(tx.pool,store.connectionId),key),name=SYSTEM_REASONS[key];
  const lead=await tx.updateLead(phone,{conversationClosed:true,conversationClosedAt:new Date().toISOString(),conversationClosedBy:'ai',conversationClosedByName:'IA',conversationClosedReason:key,conversationClosedReasonNames:[name],humanControlId:crypto.randomUUID()});
  await recordClosureReasons(tx.pool,row.data.ticketId,[reasonId]);
  await tx.pool.query("UPDATE cadence_queue SET status='stopped',reason=$3,updated_at=now() WHERE connection_id=$1 AND phone=$2 AND status IN ('waiting','queued','consent_required','awaiting_response','awaiting_delivery')",[store.connectionId,phone,name]);
  await tx.audit('conversation_closed_by_ai',null,{phone,reason:name});return lead;
 });
}
// Only a newly accepted inbound message reopens the conversation; duplicate webhooks and reminders do not.
export async function reopenConversationOnInbound(store,phone){
 return store.transaction(async tx=>{const {rows:[row]}=await tx.pool.query("SELECT data FROM leads WHERE connection_id=$1 AND phone=$2 FOR UPDATE",[store.connectionId,phone]);if(!row?.data.conversationClosed)return;
  const at=new Date().toISOString();await clearNoResponseTag(tx,phone,row.data);await tx.updateLead(phone,{conversationClosed:false,conversationReopenedAt:at,conversationReopenedBy:'client',conversationClosedReasonNames:false,conversationClosedNote:false,conversationClosureAdId:false});await tx.audit('conversation_reopened_by_client',null,{phone});
 });
}
