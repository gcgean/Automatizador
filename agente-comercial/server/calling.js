import crypto from 'node:crypto';
import fs from 'node:fs/promises';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const uuid=value=>typeof value==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(value);
const phone=value=>typeof value==='string'&&/^\d{8,15}$/.test(value);
const ended=new Set(['ended','rejected','failed']);
export function validateSession(session,type){
 if(session?.sdp_type!==type||typeof session.sdp!=='string'||session.sdp.length>100000||!session.sdp.startsWith('v=0')||!/^m=audio /m.test(session.sdp)||/^m=(video|application) /m.test(session.sdp))throw fail('Sessão de áudio inválida.');
 return {sdp_type:type,sdp:session.sdp};
}
export function callEvents(payload,phoneNumberId){
 return (payload.entry||[]).flatMap(e=>e.changes||[]).filter(c=>c.field==='calls'&&c.value?.metadata?.phone_number_id===phoneNumberId).flatMap(c=>[
  ...(c.value.calls||[]),...(c.value.statuses||[]).filter(s=>s.type==='call').map(s=>({...s,event:'status'}))
 ]).filter(c=>typeof c.id==='string'&&c.id.length<=512);
}
export class CallingService {
 constructor(store,config,{fetchImpl=fetch}={}){this.store=store;this.config=config;this.fetch=fetchImpl;}
 bind(registry){this.registry=registry;}
 async init(){await this.store.pool.query(await fs.readFile(new URL('./calling-schema.sql',import.meta.url),'utf8'));}
 async graph(connection,path,body){
  const c=await this.registry.configFor(connection);
  if(this.config.panelOnly)throw fail('Ative o atendimento antes de usar ligações.',409);
  const response=await this.fetch(`https://graph.facebook.com/${c.graphVersion}/${c.phoneNumberId}/${path}`,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+c.accessToken,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
  const data=await response.json().catch(()=>({}));
  if(!response.ok)throw Object.assign(fail('A Meta recusou a operação de ligação (código '+(data.error?.code||response.status)+'). '+({138006:'O cliente precisa autorizar a ligação.',138000:'Habilite as chamadas deste número.',131047:'O cliente precisa enviar uma mensagem para abrir a janela de atendimento.'}[data.error?.code]||'Confira a configuração e a autorização do cliente.'),502),{definite:true});
  return data;
 }
 async settings(connection){const d=await this.graph(connection,'settings');return {status:d.calling?.status||'NOT_SET',visibility:d.calling?.call_icon_visibility||'NOT_SET',iceServers:this.config.callIceServers||[]};}
 async configure(connection,enabled){if(typeof enabled!=='boolean')throw fail('Configuração inválida.');await this.graph(connection,'settings',{calling:{status:enabled?'ENABLED':'DISABLED',call_icon_visibility:enabled?'DEFAULT':'DISABLE_ALL',callback_permission_status:enabled?'ENABLED':'DISABLED'}});return this.settings(connection);}
 async permission(connection,to){if(!phone(to))throw fail('Telefone inválido.');const d=await this.graph(connection,'call_permissions?user_wa_id='+encodeURIComponent(to));return {permission:d.permission,actions:d.actions||[]};}
 async contact(connection,to){
  if(!phone(to))throw fail('Telefone inválido.');const scoped=this.store.scope(connection),lead=await scoped.getLead(to);
  if(!lead||lead.optedOut||['ganho','perdido'].includes(lead.resultado))throw fail('Reabra o atendimento e confira se o contato está desbloqueado.',409);
  const c=await this.registry.configFor(connection);if(!c.enabled)throw fail('Conexão pausada.',409);return scoped;
 }
 async requestPermission(connection,to,actor){
  const scoped=await this.contact(connection,to),events=await scoped.getEvents(to);
  if(!events.some(e=>e.direction==='in'&&Date.now()-Date.parse(e.at)<86400000))throw fail('Peça ao cliente para enviar uma mensagem antes de solicitar autorização para ligar.',409);
  const permission=await this.permission(connection,to);
  if(!permission.actions.some(a=>a.action_name==='send_call_permission_request'&&a.can_perform_action===true))throw fail('A Meta não permite outra solicitação de autorização neste momento.',409);
  const id=crypto.randomUUID(),text='Nossa equipe gostaria de conversar com você por ligação no WhatsApp. Você autoriza?';
  await scoped.recordEvent({id,phone:to,direction:'out',actor:'human',operatorName:actor.name||actor.email,text,kind:'call_permission',state:'sending'});
  try{const d=await this.graph(connection,'messages',{messaging_product:'whatsapp',to,type:'interactive',interactive:{type:'call_permission_request',body:{text},action:{name:'call_permission_request'}}});if(!d.messages?.[0]?.id)throw fail('A Meta não confirmou a solicitação. Confira antes de tentar novamente.',502);await scoped.recordEvent({id,phone:to,direction:'out',state:'accepted',messageId:d.messages[0].id});return {ok:true};}
  catch(e){await scoped.recordEvent({id,phone:to,direction:'out',state:'uncertain'});throw e;}
 }
 async list(connection,actor,clientId){
  const {rows}=await this.store.pool.query('SELECT * FROM whatsapp_calls WHERE connection_id=$1 ORDER BY created_at DESC LIMIT 30',[connection]);
  return rows.map(r=>this.public(r,actor,clientId));
 }
 public(r,actor,clientId){const mine=r.operator_id===actor.id&&r.client_id===clientId;return {id:r.id,phone:r.phone,direction:r.direction,state:r.state,operatorName:r.operator_name,mine,createdAt:r.created_at,updatedAt:r.updated_at,...(mine&&!ended.has(r.state)?{session:r.remote_session}:{})};}
 async human(connection,to,actor){await this.store.scope(connection).updateLead(to,{status:'encaminhado',humanControlId:crypto.randomUUID(),assignedUserId:actor.id,assignedUserName:actor.name||actor.email});}
 async start(connection,body,actor){
  if(!uuid(body.clientId)||!uuid(body.requestId))throw fail('Identificador de ligação inválido.');validateSession(body.session,'offer');await this.contact(connection,body.phone);
  return this.store.transaction(async tx=>{
   await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))',['calls:'+connection]);
   await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))',['call-operator:'+actor.id]);
   const old=(await tx.pool.query('SELECT * FROM whatsapp_calls WHERE id=$1',[body.requestId])).rows[0];
   if(old){if(old.connection_id!==connection||old.operator_id!==actor.id||old.client_id!==body.clientId)throw fail('Identificador já utilizado.',409);return this.public(old,actor,body.clientId);}
   if((await tx.pool.query("SELECT 1 FROM whatsapp_calls WHERE operator_id=$1 AND state NOT IN ('ended','rejected','failed')",[actor.id])).rowCount)throw fail('Encerre sua ligação atual antes de iniciar outra.',409);
   const p=await this.permission(connection,body.phone);
   if(!['temporary','permanent'].includes(p.permission?.status)||p.permission.status==='temporary'&&Number(p.permission.expiration_time)*1000<=Date.now()||!p.actions.some(a=>a.action_name==='start_call'&&a.can_perform_action===true))throw fail('O cliente precisa autorizar a ligação ou aguardar o limite informado pelo WhatsApp.',409);
   await this.human(connection,body.phone,actor);
   await tx.pool.query("INSERT INTO whatsapp_calls(id,connection_id,phone,direction,state,operator_id,operator_name,client_id,heartbeat_at) VALUES($1,$2,$3,'BUSINESS_INITIATED','starting',$4,$5,$6,now())",[body.requestId,connection,body.phone,actor.id,actor.name||actor.email,body.clientId]);
   // Commit the reservation before any remote side effect. No automatic call retries.
   return {reserved:true,id:body.requestId};
  }).then(async result=>{
   if(!result.reserved)return result;
   try{const d=await this.graph(connection,'calls',{messaging_product:'whatsapp',action:'connect',to:body.phone,session:body.session,biz_opaque_callback_data:body.requestId});const callId=d.calls?.[0]?.id;if(!callId)throw fail('Resultado da ligação incerto. Aguarde a atualização antes de tentar novamente.',502);await this.store.pool.query("UPDATE whatsapp_calls SET call_id=$2,state=CASE WHEN state='starting' THEN 'ringing' ELSE state END,updated_at=now() WHERE id=$1",[body.requestId,callId]);}
   catch(e){await this.store.pool.query("UPDATE whatsapp_calls SET state=CASE WHEN state='starting' THEN $2 ELSE state END,updated_at=now() WHERE id=$1",[body.requestId,e.definite?'failed':'uncertain']);throw e.status?e:fail('Não foi possível confirmar a ligação. Aguarde a atualização ou solicite o encerramento antes de tentar novamente.',502);}
   return (await this.list(connection,actor,body.clientId)).find(r=>r.id===body.requestId);
  });
 }
 async action(connection,id,action,body,actor){
  if(!uuid(id)||!uuid(body.clientId))throw fail('Identificador inválido.');
  return this.store.transaction(async tx=>{
   await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))',['calls:'+connection]);
   let row=(await tx.pool.query('SELECT * FROM whatsapp_calls WHERE connection_id=$1 AND id=$2 FOR UPDATE',[connection,id])).rows[0];
   if(!row)throw fail('Ligação não encontrada.',404);
   if(ended.has(row.state))return this.public(row,actor,body.clientId);
   const mine=row.operator_id===actor.id&&row.client_id===body.clientId;
   if(action==='claim'){
    await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))',['call-operator:'+actor.id]);
    if(row.operator_id&&!mine)throw fail('Outro atendente já assumiu esta ligação.',409);
    if(row.direction!=='USER_INITIATED'||row.state!=='ringing')throw fail('Esta ligação não está disponível para atender.',409);
    if((await tx.pool.query("SELECT 1 FROM whatsapp_calls WHERE operator_id=$1 AND id<>$2 AND state NOT IN ('ended','rejected','failed')",[actor.id,id])).rowCount)throw fail('Encerre sua ligação atual.',409);
    await this.human(connection,row.phone,actor);
    row=(await tx.pool.query('UPDATE whatsapp_calls SET operator_id=$2,operator_name=$3,client_id=$4,heartbeat_at=now(),updated_at=now() WHERE id=$1 RETURNING *',[id,actor.id,actor.name||actor.email,body.clientId])).rows[0];
   }else{
    if(!mine)throw fail('Apenas o atendente que assumiu a ligação pode controlá-la.',403);
    if(action==='heartbeat'){await tx.pool.query('UPDATE whatsapp_calls SET heartbeat_at=now() WHERE id=$1',[id]);return {ok:true};}
    if(!['accept','reject','terminate'].includes(action))throw fail('Ação inválida.');
    if(!row.call_id){if(action!=='terminate')throw fail('Aguardando identificação da Meta.',409);row=(await tx.pool.query("UPDATE whatsapp_calls SET state='cancel_pending',updated_at=now() WHERE id=$1 RETURNING *",[id])).rows[0];return this.public(row,actor,body.clientId);}
    if(action==='accept'){
     if(row.direction!=='USER_INITIATED'||row.state!=='ringing')throw fail('Esta ligação já foi atendida ou encerrada.',409);
     validateSession(body.session,'answer');
    }
    await this.graph(connection,'calls',{messaging_product:'whatsapp',call_id:row.call_id,action,...(action==='accept'?{session:body.session}:{})});
    row=(await tx.pool.query('UPDATE whatsapp_calls SET state=$2,remote_session=CASE WHEN $2=\'active\' THEN remote_session ELSE NULL END,heartbeat_at=now(),updated_at=now() WHERE id=$1 RETURNING *',[id,action==='accept'?'active':action==='reject'?'rejected':'ended'])).rows[0];
   }
   return this.public(row,actor,body.clientId);
  });
 }
 async receive(connection,payload,number){
  for(const c of callEvents(payload,number)){
   await this.store.transaction(async tx=>{
    await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))',['calls:'+connection]);
    let row=(await tx.pool.query('SELECT * FROM whatsapp_calls WHERE connection_id=$1 AND call_id=$2 FOR UPDATE',[connection,c.id])).rows[0];
    if(!row&&uuid(c.biz_opaque_callback_data))row=(await tx.pool.query('SELECT * FROM whatsapp_calls WHERE connection_id=$1 AND id=$2 FOR UPDATE',[connection,c.biz_opaque_callback_data])).rows[0];
    const state=c.event==='terminate'?'ended':['REJECTED','FAILED','BUSY','NO_ANSWER'].includes(c.status)?'rejected':c.status==='ACCEPTED'?'active':'ringing';
    const session=['offer','answer'].includes(c.session?.sdp_type)&&typeof c.session.sdp==='string'&&c.session.sdp.length<=100000?c.session:null;
    if(row){if(ended.has(row.state)||row.state==='cancel_pending'){if(c.event==='connect'&&row.direction==='BUSINESS_INITIATED'){await this.graph(connection,'calls',{messaging_product:'whatsapp',call_id:c.id,action:'terminate'});await tx.pool.query("UPDATE whatsapp_calls SET call_id=$2,state='ended',remote_session=NULL,updated_at=now() WHERE id=$1",[row.id,c.id]);}else if(c.event==='terminate')await tx.pool.query("UPDATE whatsapp_calls SET state='ended',remote_session=NULL,updated_at=now() WHERE id=$1",[row.id]);return;}await tx.pool.query('UPDATE whatsapp_calls SET call_id=$2,state=$3,remote_session=CASE WHEN $3 IN (\'ended\',\'rejected\') THEN NULL ELSE COALESCE($4::jsonb,remote_session) END,updated_at=now() WHERE id=$1',[row.id,c.id,row.state==='active'&&state==='ringing'?'active':state,session?JSON.stringify(session):null]);}
    else{const to=c.direction==='USER_INITIATED'?c.from:c.to;if(!phone(to))return;await tx.pool.query('INSERT INTO whatsapp_calls(id,connection_id,call_id,phone,direction,state,remote_session) VALUES($1,$2,$3,$4,$5,$6,$7)',[crypto.randomUUID(),connection,c.id,to,c.direction||'USER_INITIATED',state,ended.has(state)?null:session]);}
   });
  }
 }
 async sweep(){
  const rows=(await this.store.pool.query("SELECT * FROM whatsapp_calls WHERE state NOT IN ('ended','rejected','failed') AND ((operator_id IS NOT NULL AND heartbeat_at<now()-interval '45 seconds') OR (operator_id IS NULL AND created_at<now()-interval '75 seconds') OR (state='cancel_pending' AND updated_at<now()-interval '75 seconds'))")).rows;
  for(const r of rows){try{await this.store.transaction(async tx=>{
   await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))',['calls:'+r.connection_id]);
   const current=(await tx.pool.query("SELECT * FROM whatsapp_calls WHERE id=$1 AND state NOT IN ('ended','rejected','failed') AND ((operator_id IS NOT NULL AND heartbeat_at<now()-interval '45 seconds') OR (operator_id IS NULL AND created_at<now()-interval '75 seconds') OR (state='cancel_pending' AND updated_at<now()-interval '75 seconds')) FOR UPDATE",[r.id])).rows[0];
   if(!current)return;
   if(current.call_id)await this.graph(current.connection_id,'calls',{messaging_product:'whatsapp',call_id:current.call_id,action:'terminate'});
   await tx.pool.query("UPDATE whatsapp_calls SET state='ended',remote_session=NULL,updated_at=now() WHERE id=$1",[current.id]);
  });}catch{/* Keep uncertain calls reserved; never originate again automatically. */}}

 }
}
