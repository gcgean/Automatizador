import {ambiguousFollowupAnswer,cadenceRefusal,previousFollowupMessage} from './cadence.js';

export function legacyAmbiguousRefusal(lead,events){
 if(!lead?.cadenceDeclined||lead.optedOut||lead.cadenceRefusalRule==='followup-v2'||lead.cadenceStopReason!=='Cliente recusou o acompanhamento')return null;
 const ambiguous=[];
 for(let i=0;i<events.length;i++){
  const e=events[i];if(e.direction!=='in')continue;
  if(cadenceRefusal(e.text,previousFollowupMessage(events,i)?.text))return null;
  if(ambiguousFollowupAnswer(e.text))ambiguous.push(e.id);
 }
 return ambiguous.length?{messageIds:ambiguous}:null;
}

export async function reconcileAmbiguousRefusals(store,{apply=false}={}){
 const rows=(await store.pool.query("SELECT l.connection_id,l.phone FROM leads l JOIN whatsapp_connections c ON c.id=l.connection_id WHERE c.company_id='default' AND l.data->>'cadenceDeclined'='true'")).rows;let corrected=0;
 for(const row of rows){
  const changed=await store.scope(row.connection_id).transaction(async tx=>{
   const lead=(await tx.pool.query('SELECT data FROM leads WHERE connection_id=$1 AND phone=$2 FOR UPDATE',[row.connection_id,row.phone])).rows[0]?.data;
   const evidence=legacyAmbiguousRefusal(lead,await tx.getEvents(row.phone));if(!evidence)return false;if(!apply)return true;
   await tx.updateLead(row.phone,{cadenceDeclined:false,cadenceReviewRequired:true,cadenceStopReason:'Resposta antiga ambígua; confirmar autorização para retomada',cadenceRefusalCorrectedAt:new Date().toISOString()});
   await tx.pool.query("UPDATE cadence_queue SET status='stopped',reason='Resposta ambígua revisada; sem retomada automática',updated_at=now() WHERE connection_id=$1 AND phone=$2 AND status IN ('waiting','queued','consent_required','awaiting_response','awaiting_delivery')",[row.connection_id,row.phone]);
   await tx.pool.query("UPDATE cadence_attempts SET status='skipped',error='Revisão de autorização pendente' WHERE connection_id=$1 AND phone=$2 AND status='queued'",[row.connection_id,row.phone]);
   await tx.audit('ambiguous_followup_refusal_corrected',null,{phone:row.phone,messageIds:evidence.messageIds,previous:{cadenceDeclined:lead.cadenceDeclined,cadenceStopReason:lead.cadenceStopReason},automaticFollowupPaused:true});return true;
  });if(changed)corrected++;
 }
 return {mode:apply?'applied':'preview',examined:rows.length,corrected,preserved:rows.length-corrected};
}
