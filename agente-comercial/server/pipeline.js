import crypto from 'node:crypto';
import {can} from '../shared/access.js';
import {visibilitySQL,canSeeLead} from './conversation-access.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const uuid=s=>typeof s==='string'&&/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s);
const fields=`p.id,p.company_id,p.connection_id,p.phone,p.title,p.stage_id,p.owner_id,p.value_cents::float8 AS value_cents,p.status,p.next_action,p.due_at,p.loss_reason,p.version,p.source,p.created_at,p.updated_at,p.closed_at,COALESCE(NULLIF(u.name,''),u.email,'Sem responsável') AS owner_name,COALESCE(l.data->>'nome',l.data->>'nomeWhatsApp','Contato') AS contact_name,l.data->>'empresa' AS contact_company,l.data->>'temperatura' AS temperature,(l.data->>'conversationClosed'='true') AS conversation_closed,l.data->>'status' AS lead_status,l.data->>'resultado' AS lead_outcome,l.data->>'agendamentoResumo' AS appointment,c.name AS connection_name,c.color AS connection_color`;
export class Pipeline{
 constructor(store,auth){this.store=store;this.auth=auth;}
 async init(){
  if((await this.store.pool.query("SELECT 1 FROM schema_migrations WHERE version='pipeline-seed-v1'")).rowCount)return;
  const rows=(await this.store.pool.query("SELECT connection_id,phone FROM leads WHERE COALESCE(data->>'resultado','aberto') NOT IN ('ganho','perdido') AND (data->>'temperatura' IN ('morno','quente') OR data->>'crmEngaged'='true' OR NULLIF(data->>'produtos_interesse','') IS NOT NULL OR data->>'resultado' IN ('apresentacao_agendada','apresentacao_solicitada')) LIMIT 5000")).rows;
  for(const r of rows)await this.syncLead(r.connection_id,r.phone);
  await this.store.pool.query("INSERT INTO schema_migrations(version) VALUES('pipeline-seed-v1') ON CONFLICT DO NOTHING");
 }
 async connection(id,user){const c=await this.store.getConnection(id);if(c.company_id!==user.company_id||user.role!=='admin'&&!user.connections.includes(id))throw fail('Conexão indisponível nesta empresa.',404);return c;}
 async access(id,user,store=this.store){
  if(!can(user,'pipeline.view'))throw fail('Seu acesso não permite visualizar o CRM.',403);
  const row=(await store.pool.query(`SELECT ${fields} FROM pipeline_opportunities p JOIN leads l ON l.connection_id=p.connection_id AND l.phone=p.phone JOIN whatsapp_connections c ON c.id=p.connection_id LEFT JOIN users u ON u.id=p.owner_id WHERE p.id=$1 AND p.company_id=$2 AND ($3::boolean OR p.connection_id=ANY($4::text[])) AND ($3::boolean OR ${visibilitySQL('p.connection_id','p.phone','$5')})`,[id,user.company_id,user.role==='admin',user.connections||[],user.id])).rows[0];
  if(!row)throw fail('Oportunidade não encontrada ou indisponível.',404);return row;
 }
 async list(user,filters={}){
  if(!can(user,'pipeline.view'))throw fail('Seu acesso não permite visualizar o CRM.',403);
  if(filters.connection)await this.connection(filters.connection,user);
  const status=['open','won','lost'].includes(filters.status)?filters.status:'open',search=String(filters.search||'').slice(0,150).replace(/[\\%_]/g,'\\$&');
  if(filters.owner&&!uuid(filters.owner))throw fail('Responsável inválido.');
  const args=[user.company_id,user.role==='admin',user.connections||[],user.id,filters.connection||null,filters.owner||null,'%'+search+'%'];
  const where=`p.company_id=$1 AND ($2::boolean OR p.connection_id=ANY($3::text[])) AND ($2::boolean OR ${visibilitySQL('p.connection_id','p.phone','$4')}) AND ($5::text IS NULL OR p.connection_id=$5) AND ($6::uuid IS NULL OR p.owner_id=$6) AND (p.title ILIKE $7 OR COALESCE(l.data->>'nome',l.data->>'nomeWhatsApp','') ILIKE $7 OR COALESCE(l.data->>'empresa','') ILIKE $7)`;
  const joins='FROM pipeline_opportunities p JOIN leads l ON l.connection_id=p.connection_id AND l.phone=p.phone JOIN whatsapp_connections c ON c.id=p.connection_id LEFT JOIN users u ON u.id=p.owner_id';
  const [cards,metrics,stages,owners]=await Promise.all([
   this.store.pool.query(`SELECT ${fields} ${joins} WHERE ${where} AND p.status=$8 ORDER BY p.due_at ASC NULLS LAST,p.updated_at DESC LIMIT 300`,[...args,status]),
   this.store.pool.query(`SELECT count(*) FILTER(WHERE p.status='open')::int AS open_count,COALESCE(sum(p.value_cents) FILTER(WHERE p.status='open'),0)::float8 AS open_value,count(DISTINCT (p.connection_id,p.phone)) FILTER(WHERE p.status='open' AND p.due_at<now())::int AS overdue_count,COALESCE(sum(p.value_cents) FILTER(WHERE p.status='won' AND p.closed_at>=date_trunc('month',now() AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'America/Sao_Paulo'),0)::float8 AS won_month_value ${joins} WHERE ${where}`,args),
   this.store.pool.query('SELECT id,name,position,color FROM pipeline_stages WHERE company_id=$1 ORDER BY position',[user.company_id]),
   this.store.pool.query('SELECT id,COALESCE(NULLIF(name,\'\'),email) AS name FROM users WHERE company_id=$1 AND active ORDER BY name,email',[user.company_id])
  ]);
  return {opportunities:cards.rows,metrics:metrics.rows[0],stages:stages.rows,owners:owners.rows,limit:300};
 }
 async detail(id,user){const opportunity=await this.access(id,user);const notes=(await this.store.pool.query("SELECT n.id,n.body,n.created_at,COALESCE(NULLIF(u.name,''),'Equipe') AS author FROM pipeline_notes n LEFT JOIN users u ON u.id=n.user_id WHERE n.opportunity_id=$1 AND n.company_id=$2 ORDER BY n.created_at DESC LIMIT 50",[id,user.company_id])).rows;return {opportunity,notes};}
 async save(body,user,id=null){
  if(!can(user,'pipeline.view')||!can(user,'pipeline.manage'))throw fail('Seu acesso não permite editar o CRM.',403);
  const title=String(body.title||'').trim(),value=body.value_cents??0,next=String(body.next_action||'').trim(),loss=String(body.loss_reason||'').trim(),due=body.due_at?new Date(body.due_at):null;
  if(!title||title.length>150||!uuid(body.stage_id)||body.owner_id&&!uuid(body.owner_id)||!Number.isSafeInteger(value)||value<0||value>1e14||next.length>300||loss.length>500||due&&!Number.isFinite(due.getTime())||!['open','won','lost'].includes(body.status||'open')||body.status==='lost'&&!loss)throw fail('Confira título, etapa, valor, responsável e próximo contato. Informe o motivo de uma perda.');
  const opportunityId=id||body.requestId;if(!uuid(opportunityId))throw fail('Identificador inválido.');
  const hash=crypto.createHash('sha256').update(JSON.stringify(body)).digest('hex');
  return this.store.transaction(async tx=>{
   let old=null;if(id){old=await this.access(id,user,tx);const locked=(await tx.pool.query('SELECT version FROM pipeline_opportunities WHERE id=$1 FOR UPDATE',[id])).rows[0];if(!locked||locked.version!==body.version)throw fail('Esta oportunidade mudou. Atualize antes de salvar.',409);}
   else{const existing=(await tx.pool.query('SELECT company_id,create_hash FROM pipeline_opportunities WHERE id=$1',[opportunityId])).rows[0];if(existing){if(existing.company_id!==user.company_id||existing.create_hash!==hash)throw fail('Identificador já utilizado.',409);await this.access(opportunityId,user,tx);return {id:opportunityId};}}
   const connectionId=old?.connection_id||body.connection_id,phone=old?.phone||String(body.phone||'').replace(/\D/g,'');if(!/^\d{8,20}$/.test(phone))throw fail('Informe um telefone válido com DDD e código do país.');await this.connection(connectionId,user);
   if(!(await tx.pool.query('SELECT 1 FROM pipeline_stages WHERE id=$1 AND company_id=$2',[body.stage_id,user.company_id])).rowCount)throw fail('Etapa de outra empresa ou inválida.');
   if(body.owner_id){const owner=await this.auth.identity(body.owner_id);if(!owner||owner.company_id!==user.company_id||!can(owner,'pipeline.view')||owner.role!=='admin'&&!owner.connections.includes(connectionId))throw fail('Escolha um responsável ativo com acesso à conexão.');}
   const scoped=tx.scope(connectionId),lead=await scoped.getLead(phone);if(lead&&!canSeeLead(user,lead))throw fail('Atendimento reservado a outro responsável.',404);
   if(!lead){const name=String(body.contact_name||'').trim(),company=String(body.contact_company||'').trim();if(!name||name.length>150||company.length>150)throw fail('Informe o nome do contato (até 150 caracteres).');await scoped.updateLead(phone,{nome:name,...(company?{empresa:company}:{})});}
   const status=body.status||'open';
   if(old)await tx.pool.query(`UPDATE pipeline_opportunities SET title=$2,stage_id=$3,owner_id=$4,value_cents=$5,status=$6,next_action=$7,due_at=$8,loss_reason=$9,stage_manual=true,closed_at=CASE WHEN $6='open' THEN NULL WHEN status=$6 THEN closed_at ELSE now() END,version=version+1,updated_at=now() WHERE id=$1`,[id,title,body.stage_id,body.owner_id||null,value,status,next,due,loss]);
   else await tx.pool.query(`INSERT INTO pipeline_opportunities(id,company_id,connection_id,phone,title,stage_id,owner_id,value_cents,status,next_action,due_at,loss_reason,closed_at,create_hash) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,CASE WHEN $9='open' THEN NULL ELSE now() END,$13)`,[opportunityId,user.company_id,connectionId,phone,title,body.stage_id,body.owner_id||null,value,status,next,due,loss,hash]);
   await tx.audit(old?'pipeline_updated':'pipeline_created',user.id,{opportunityId,companyId:user.company_id,connectionId,status});return {id:opportunityId};
  });
 }
 async note(id,body,user){
  if(!can(user,'pipeline.view')||!can(user,'pipeline.manage'))throw fail('Seu acesso não permite editar o CRM.',403);await this.access(id,user);
  const text=String(body.body||'').trim();if(!text||text.length>4000||!uuid(body.requestId))throw fail('Escreva uma anotação de até 4.000 caracteres.');
  await this.store.pool.query('INSERT INTO pipeline_notes(id,company_id,opportunity_id,user_id,body) VALUES($1,$2,$3,$4,$5) ON CONFLICT(id) DO NOTHING',[body.requestId,user.company_id,id,user.id,text]);return {ok:true};
 }
 async stages(body,user){
  if(user.role!=='admin')throw fail('Somente o administrador da empresa pode configurar o funil.',403);
  if(!Array.isArray(body.stages)||body.stages.length!==4||new Set(body.stages.map(s=>s.id)).size!==4||body.stages.some(s=>!uuid(s.id)||typeof s.name!=='string'||!s.name.trim()||s.name.length>40||!/^#[a-f0-9]{6}$/i.test(s.color)))throw fail('Informe as quatro etapas, com nomes e cores válidos.');
  return this.store.transaction(async tx=>{for(const s of body.stages){if(!(await tx.pool.query('UPDATE pipeline_stages SET name=$3,color=$4 WHERE id=$1 AND company_id=$2 RETURNING id',[s.id,user.company_id,s.name.trim(),s.color])).rowCount)throw fail('Etapa não encontrada.',404);}await tx.audit('pipeline_stages_updated',user.id,{companyId:user.company_id});return {ok:true};});
 }
 async syncLead(connectionId,phone){
  const scoped=this.store.scope(connectionId),lead=await scoped.getLead(phone);if(!lead||lead.optedOut||['ganho','perdido'].includes(lead.resultado)||!lead.crmEngaged&&!['quente','morno'].includes(lead.temperatura)&&!lead.produtos_interesse&&!['apresentacao_agendada','apresentacao_solicitada'].includes(lead.resultado))return;
  const c=await scoped.getConnection();if(!c.company_active)return;
  const position=lead.agendamentoResumo&&!lead.needsAgendaCancellation?2:1,stage=(await this.store.pool.query('SELECT id FROM pipeline_stages WHERE company_id=$1 AND position=$2',[c.company_id,position])).rows[0];if(!stage)return;
  const owner=lead.assignedUserId&&(await this.store.pool.query('SELECT id FROM users WHERE id=$1 AND company_id=$2 AND active',[lead.assignedUserId,c.company_id])).rows[0]?.id||null;
  const title=String(lead.produtos_interesse||lead.dor_principal||'Oportunidade comercial').slice(0,150);
  await this.store.pool.query(`INSERT INTO pipeline_opportunities(id,company_id,connection_id,phone,title,stage_id,owner_id,source,next_action) VALUES($1,$2,$3,$4,$5,$6,$7,'automatic',$8) ON CONFLICT(connection_id,phone) WHERE source='automatic' DO UPDATE SET stage_id=CASE WHEN pipeline_opportunities.stage_manual THEN pipeline_opportunities.stage_id ELSE excluded.stage_id END,version=pipeline_opportunities.version+1,updated_at=now() WHERE pipeline_opportunities.status='open' AND NOT pipeline_opportunities.stage_manual AND pipeline_opportunities.stage_id<>excluded.stage_id`,[crypto.randomUUID(),c.company_id,connectionId,phone,title,stage.id,owner,lead.agendamentoResumo?'Acompanhar apresentação':'Retornar contato']);
 }
}
