export async function cadenceAttemptRecords(store,id,phones){
 if(!phones.length)return [];
 return (await store.pool.query(`SELECT a.*,m.data->>'text' AS text,m.data->>'state' AS message_state,
  COALESCE(a.message_id,m.message_id) AS meta_message_id,d.status AS delivery_status,d.data->'errors' AS delivery_errors,
  d.data->>'timestamp' AS delivery_timestamp,d.updated_at AS delivery_updated_at,
  COALESCE(a.started_at,m.occurred_at,a.accepted_at,a.created_at) AS attempted_at
 FROM cadence_attempts a
 LEFT JOIN LATERAL(SELECT data,message_id,occurred_at FROM messages WHERE connection_id=a.connection_id AND phone=a.phone
  AND (data->>'cadenceAttemptId'=a.id::text OR (a.message_id IS NOT NULL AND message_id=a.message_id)) ORDER BY occurred_at DESC LIMIT 1)m ON true
 LEFT JOIN deliveries d ON d.connection_id=a.connection_id AND d.message_id=COALESCE(a.message_id,m.message_id)
 WHERE a.connection_id=$1 AND a.phone=ANY($2::text[]) ORDER BY COALESCE(a.started_at,m.occurred_at,a.accepted_at,a.created_at) DESC,a.created_at DESC`,[id,phones])).rows;
}
export const attemptedSend=a=>a.status==='accepted'||!!a.meta_message_id||['accepted','sent','delivered','read'].includes(a.message_state);
export const deliveredAttempt=a=>['delivered','read'].includes(a.delivery_status||a.message_state);
export async function cadenceReport(store,id){
 const rows=(await store.pool.query(`SELECT q.*,COALESCE(NULLIF(l.data->>'nome',''),l.data->>'nomeWhatsApp','Contato') AS contact_name,
  l.data->>'status' AS lead_status,l.data->>'resultado' AS lead_outcome,l.data->>'conversationClosed'='true' AS conversation_closed,
  l.data->>'conversationClosedReason' AS conversation_closed_reason,COALESCE(s.max_attempts,5) AS max_attempts
  FROM cadence_queue q JOIN leads l ON l.connection_id=q.connection_id AND l.phone=q.phone LEFT JOIN cadence_settings s ON s.connection_id=q.connection_id
  WHERE q.connection_id=$1 ORDER BY q.updated_at DESC,q.phone LIMIT 100`,[id])).rows;
 const phones=rows.map(q=>q.phone);
 const [attempts,customer]=await Promise.all([cadenceAttemptRecords(store,id,phones),phones.length?store.pool.query("SELECT DISTINCT ON(phone) phone,occurred_at,data->>'text' AS text FROM messages WHERE connection_id=$1 AND phone=ANY($2::text[]) AND direction='in' ORDER BY phone,occurred_at DESC,id DESC",[id,phones]).then(r=>r.rows):[]]);
 const byPhone=new Map(),customers=new Map(customer.map(c=>[c.phone,c]));for(const a of attempts){if(!byPhone.has(a.phone))byPhone.set(a.phone,[]);byPhone.get(a.phone).push(a);}
 return rows.map(q=>{const history=byPhone.get(q.phone)||[],sends=history.filter(attemptedSend),lastSend=sends[0],incoming=customers.get(q.phone),replied=!!(lastSend&&incoming&&new Date(incoming.occurred_at)>new Date(lastSend.attempted_at));
  const format=a=>({id:a.id,attempt:a.attempt,status:a.status,at:a.attempted_at,accepted_at:a.accepted_at,delivery_status:a.delivery_status||a.message_state||null,delivery_errors:a.delivery_errors||[],error:a.error||null,text:a.text||null,current_cycle:a.cycle_id===q.cycle_id});
  return {...q,remaining_attempts:Math.max(0,q.max_attempts-q.attempts),has_send:!!sends.length,has_request:history.some(a=>a.started_at||a.message_state==='uncertain'),has_delivery:sends.some(deliveredAttempt),total_sent_attempts:sends.length,
   last_attempt:history[0]?format(history[0]):null,client_replied:replied,reply_at:replied?incoming.occurred_at:null,last_customer_at:incoming?.occurred_at||null,last_customer_text:incoming?.text||null,
   finalized_no_response:q.conversation_closed&&q.conversation_closed_reason==='cadence_no_response',attempt_history:history.slice(0,10).map(format)};
 });
}
