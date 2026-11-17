import {clearNoResponseTag} from './conversation-lifecycle.js';
import crypto from 'node:crypto';
import {canSeeLead} from './conversation-access.js';
const fail=(text,status=400)=>Object.assign(new Error(text),{status});

export async function listAttendances(store,user){
 const leads=await store.listLeads();
 const {rows}=await store.pool.query(`SELECT t.*,d.name AS department_name,m.data AS last_message,m.occurred_at AS last_at,
 (SELECT count(*)::int FROM messages i WHERE i.ticket_id=t.id AND i.direction='in' AND i.occurred_at>COALESCE((SELECT max(o.occurred_at) FROM messages o WHERE o.ticket_id=t.id AND o.direction='out' AND COALESCE(o.data->>'state','') IN ('sent','accepted','delivered','read')),'epoch')) AS pending
 FROM service_tickets t LEFT JOIN departments d ON d.id=t.department_id
 LEFT JOIN LATERAL(SELECT data,occurred_at FROM messages WHERE ticket_id=t.id AND COALESCE(data->>'state','')<>'internal' ORDER BY occurred_at DESC,id DESC LIMIT 1) m ON true
 WHERE t.connection_id=$1 AND (m.occurred_at IS NOT NULL OR t.snapshot ? 'conversationReopenedAt' OR EXISTS(SELECT 1 FROM ticket_receipts r WHERE r.ticket_id=t.id)) ORDER BY COALESCE(t.closed_at,m.occurred_at,t.opened_at) DESC,t.id DESC`,[store.connectionId]);
 return rows.filter(t=>canSeeLead(user,leads[t.phone])&&canSeeLead(user,t.snapshot)).map(t=>{
  const current=String(leads[t.phone]?.ticketId)===String(t.id),lead=current?leads[t.phone]:t.snapshot;
  return {...lead,telefone:t.phone,connectionId:store.connectionId,ticketId:t.id,currentTicket:current,conversationClosed:!!t.closed_at,
   ticketOpenedAt:t.opened_at,ticketClosedAt:t.closed_at,departmentName:t.department_name,assignedUserId:t.assigned_user_id||false,departmentId:t.department_id||false,
   lastMessageAt:t.last_at,lastMessage:t.last_message?.text,lastMessageDirection:t.last_message?.direction,lastMessageActor:t.last_message?.actor,pendingReplyCount:t.closed_at?0:t.pending};
 });
}

// Called inside the existing transaction for app echoes, or before processing an inbox job.
export async function acceptTicketMessage(tx,phone,messageId,at,source='client'){
 await tx.pool.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['ticket:'+tx.connectionId+':'+phone]);
 const previous=(await tx.pool.query('SELECT t.closed_at FROM ticket_receipts r LEFT JOIN service_tickets t ON t.id=r.ticket_id WHERE r.connection_id=$1 AND r.message_id=$2',[tx.connectionId,messageId])).rows[0];
 if(previous)return {stale:!!previous.closed_at};
 let lead=await tx.getLead(phone);
 if(!lead)lead=await tx.updateLead(phone,{});
 const {rows:[latest]}=await tx.pool.query('SELECT * FROM service_tickets WHERE connection_id=$1 AND phone=$2 ORDER BY id DESC LIMIT 1 FOR UPDATE',[tx.connectionId,phone]);
 if(!lead.conversationClosed&&lead.departmentId===undefined){
  const {rows:sectors}=await tx.pool.query('SELECT d.id FROM departments d JOIN department_connections c ON c.department_id=d.id WHERE c.connection_id=$1 AND d.active',[tx.connectionId]);
  if(sectors.length===1)await tx.updateLead(phone,{departmentId:sectors[0].id});
 }
 const timestamp=(/^\d+$/.test(String(at))?Number(at)*1000:Date.parse(at));
 const older=Number.isFinite(timestamp)?(await tx.pool.query('SELECT id FROM service_tickets WHERE connection_id=$1 AND phone=$2 AND closed_at IS NOT NULL AND floor(extract(epoch FROM closed_at))>$3 ORDER BY closed_at ASC LIMIT 1',[tx.connectionId,phone,Math.floor(timestamp/1000)])).rows[0]:null;
 const stale=!!older||latest?.closed_at&&Number.isFinite(timestamp)&&Math.floor(timestamp/1000)<Math.floor(new Date(latest.closed_at).getTime()/1000);
 if(lead.conversationClosed&&!stale){
  await clearNoResponseTag(tx,phone,lead);
  const {rows:departments}=await tx.pool.query('SELECT d.id FROM departments d JOIN department_connections c ON c.department_id=d.id WHERE c.connection_id=$1 AND d.active',[tx.connectionId]);
  await tx.updateLead(phone,{conversationClosed:false,conversationClosedReason:false,conversationReopenedAt:new Date().toISOString(),conversationReopenedBy:source,
   status:lead.optedOut?'bloqueado':source==='whatsapp_app'?'encaminhado':'em_conversa',assignedUserId:false,assignedUserName:false,
   departmentId:departments.length===1?departments[0].id:false,humanControlId:crypto.randomUUID(),businessAppControlId:false,
   previousTicketOutcome:lead.resultado||false,resultado:'aberto',consultantOffer:false,consultantLastOfferedAt:false});
  await tx.audit('ticket_opened_after_close',null,{phone,previousTicketId:latest?.id,source});
 }
 const {rows:[ticket]}=await tx.pool.query('SELECT id FROM service_tickets WHERE connection_id=$1 AND phone=$2 ORDER BY id DESC LIMIT 1',[tx.connectionId,phone]);
 await tx.pool.query('INSERT INTO ticket_receipts(connection_id,message_id,ticket_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[tx.connectionId,messageId,older?.id||ticket?.id||null]);
 return {stale:!!stale};
}

export async function ticketHistory(store,phone){
 const {rows}=await store.pool.query(`SELECT t.id,t.opened_at,t.closed_at,d.name AS department_name,u.name AS assigned_user_name,
 (SELECT count(*)::int FROM messages m WHERE m.ticket_id=t.id) AS message_count
 FROM service_tickets t LEFT JOIN departments d ON d.id=t.department_id LEFT JOIN users u ON u.id=t.assigned_user_id
 WHERE t.connection_id=$1 AND t.phone=$2 ORDER BY t.id DESC`,[store.connectionId,phone]);
 const {rows:transfers}=await store.pool.query(`SELECT x.*,a.name AS actor_name,u.name AS from_user_name,v.name AS to_user_name,d.name AS from_department_name,e.name AS to_department_name
 FROM ticket_transfers x JOIN service_tickets t ON t.id=x.ticket_id LEFT JOIN users a ON a.id=x.actor_id LEFT JOIN users u ON u.id=x.from_user LEFT JOIN users v ON v.id=x.to_user
 LEFT JOIN departments d ON d.id=x.from_department LEFT JOIN departments e ON e.id=x.to_department WHERE t.connection_id=$1 AND t.phone=$2 ORDER BY x.at,x.id`,[store.connectionId,phone]);
 return rows.map(t=>({...t,transfers:transfers.filter(x=>x.ticket_id===t.id)}));
}

export async function listDepartments(store,companyId,connectionId=null){
 return (await store.pool.query(`SELECT d.*,COALESCE((SELECT json_agg(user_id) FROM department_users WHERE department_id=d.id),'[]') AS users,
 COALESCE((SELECT json_agg(connection_id) FROM department_connections WHERE department_id=d.id),'[]') AS connections
 FROM departments d WHERE company_id=$1 AND ($2::text IS NULL OR EXISTS(SELECT 1 FROM department_connections WHERE department_id=d.id AND connection_id=$2)) ORDER BY name`,[companyId,connectionId])).rows;
}
export async function saveDepartment(store,companyId,body){
 if(typeof body.name!=='string'||!body.name.trim()||body.name.trim().length>100||!Array.isArray(body.users)||!Array.isArray(body.connections)||body.users.some(id=>typeof id!=='string'||!/^[-a-f0-9]{36}$/i.test(id))||body.connections.some(id=>typeof id!=='string'))throw fail('Informe o nome, usuários e conexões do setor.');
 const id=body.id||crypto.randomUUID();if(!/^[-a-f0-9]{36}$/i.test(id))throw fail('Setor inválido.');
 return store.transaction(async tx=>{
  const users=[...new Set(body.users)],connections=[...new Set(body.connections)];
  if((await tx.pool.query('SELECT id FROM users WHERE company_id=$1 AND id=ANY($2::uuid[])',[companyId,users])).rowCount!==users.length||(await tx.pool.query('SELECT id FROM whatsapp_connections WHERE company_id=$1 AND id=ANY($2::text[])',[companyId,connections])).rowCount!==connections.length)throw fail('Selecione usuários e conexões desta empresa.');
  const saved=await tx.pool.query('INSERT INTO departments(id,company_id,name,active) VALUES($1,$2,$3,$4) ON CONFLICT(id) DO UPDATE SET name=excluded.name,active=excluded.active WHERE departments.company_id=excluded.company_id RETURNING id',[id,companyId,body.name.trim(),body.active!==false]);
  if(!saved.rowCount)throw fail('Setor não encontrado.',404);
  await tx.pool.query('DELETE FROM department_users WHERE department_id=$1',[id]);await tx.pool.query('DELETE FROM department_connections WHERE department_id=$1',[id]);
  for(const userId of users)await tx.pool.query('INSERT INTO department_users VALUES($1,$2)',[id,userId]);
  for(const connection of connections)await tx.pool.query('INSERT INTO department_connections VALUES($1,$2)',[id,connection]);
  return {id};
 });
}

export async function transferTicket(store,phone,body,person,user){
 return store.transaction(async tx=>{
  const {rows:[row]}=await tx.pool.query('SELECT data FROM leads WHERE connection_id=$1 AND phone=$2 FOR UPDATE',[store.connectionId,phone]);
  if(!row)throw fail('Contato não encontrado.',404);if(body.ticketId&&String(row.data.ticketId)!==String(body.ticketId))throw fail('O chamado mudou. Atualize a tela antes de transferir.',409);if(row.data.conversationClosed||row.data.optedOut)throw fail('Abra um novo chamado antes de transferir.',409);
  let department=null;
  if(body.departmentId){
   if(typeof body.departmentId!=='string'||!/^[-a-f0-9]{36}$/i.test(body.departmentId))throw fail('Setor inválido.');
   department=(await tx.pool.query('SELECT d.* FROM departments d JOIN department_connections c ON c.department_id=d.id WHERE d.id=$1 AND c.connection_id=$2 AND d.active',[body.departmentId,store.connectionId])).rows[0];
   if(!department)throw fail('Selecione um setor ativo vinculado a este número.');
   if(person&&!(await tx.pool.query('SELECT 1 FROM department_users WHERE department_id=$1 AND user_id=$2',[department.id,person.id])).rowCount)throw fail('O atendente não está vinculado ao setor selecionado.');
  }
  if(!person&&!department)throw fail('Escolha um setor ou um atendente.');
  await tx.pool.query("SELECT set_config('app.ticket_actor',$1,true)",[user.id]);
  await tx.updateLead(phone,{status:'encaminhado',humanControlId:crypto.randomUUID(),assignedUserId:person?.id||false,assignedUserName:person?.name||person?.email||false,departmentId:department?.id||false});
  await tx.recordEvent({id:crypto.randomUUID(),phone,direction:'out',actor:'system',kind:'handoff',state:'internal',text:'Chamado transferido para '+[department?.name,person?.name||person?.email||'fila do setor'].filter(Boolean).join(' · ')+'.'});
  await tx.audit('ticket_transferred',user.id,{phone,assignedUserId:person?.id,departmentId:department?.id});
  return {ok:true};
 });
}
