import crypto from 'node:crypto';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export async function clearNoResponseTag(store,phone,lead){
 if(lead.conversationClosedReason!=='cadence_no_response'||!lead.cadenceNoResponseTagId)return;
 await store.pool.query("DELETE FROM lead_tags WHERE connection_id=$1 AND phone=$2 AND tag_id=$3 AND source='cadence_no_response'",[store.connectionId,phone,lead.cadenceNoResponseTagId]);
 await store.updateLead(phone,{cadenceNoResponseTagId:false,conversationClosedReason:false});
}
export async function setConversationClosed(store,phone,closed,user,jobs={},expectedTicketId=null){
 if(typeof closed!=='boolean')throw fail('Informe se deseja finalizar ou reabrir a conversa.');
 if(closed&&Object.values(jobs).some(j=>j.message.from===phone&&(j.status==='attention'||j.message.manual&&['queued','processing'].includes(j.status))))throw fail('Confira os envios pendentes deste contato antes de finalizar a conversa.',409);
 return store.transaction(async tx=>{
  const {rows:[row]}=await tx.pool.query('SELECT data FROM leads WHERE connection_id=$1 AND phone=$2 FOR UPDATE',[store.connectionId,phone]);if(!row)throw fail('Contato não encontrado.',404);if(expectedTicketId&&String(row.data.ticketId)!==String(expectedTicketId))throw fail('O chamado mudou. Atualize a tela antes de continuar.',409);
  if((row.data.conversationClosed===true)===closed)return row.data;
  const at=new Date().toISOString(),patch={conversationClosed:closed,humanControlId:crypto.randomUUID(),...(closed?{conversationClosedAt:at,conversationClosedBy:user.id,conversationClosedByName:user.name||user.email}:{conversationReopenedAt:at,conversationReopenedBy:user.id})};
  if(!closed)await clearNoResponseTag(tx,phone,row.data);
  if(closed)patch.conversationClosedReason='manual';
  await tx.pool.query("SELECT set_config('app.ticket_actor',$1,true)",[user.id]);
  const lead=await tx.updateLead(phone,patch);
  if(closed)await tx.pool.query("UPDATE cadence_queue SET status='stopped',reason='Conversa finalizada pela equipe',updated_at=now() WHERE connection_id=$1 AND phone=$2 AND status IN ('waiting','queued','consent_required','awaiting_response','awaiting_delivery')",[store.connectionId,phone]);
  await tx.audit(closed?'conversation_closed':'conversation_reopened',user.id,{phone});return lead;
 });
}
// Only a newly accepted inbound message reopens the conversation; duplicate webhooks and reminders do not.
export async function reopenConversationOnInbound(store,phone){
 return store.transaction(async tx=>{const {rows:[row]}=await tx.pool.query("SELECT data FROM leads WHERE connection_id=$1 AND phone=$2 FOR UPDATE",[store.connectionId,phone]);if(!row?.data.conversationClosed)return;
  const at=new Date().toISOString();await clearNoResponseTag(tx,phone,row.data);await tx.updateLead(phone,{conversationClosed:false,conversationReopenedAt:at,conversationReopenedBy:'client'});await tx.audit('conversation_reopened_by_client',null,{phone});
 });
}
