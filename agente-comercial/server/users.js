import crypto from 'node:crypto';
import {permissionList} from './access.js';
const hash=value=>crypto.createHash('sha256').update(value).digest('hex');
const error=(message,status=400)=>Object.assign(new Error(message),{status});
export class UserAdministration{
 constructor(store,publicUrl){this.store=store;this.publicUrl=publicUrl;}
 async list(companyId='default',actor=null){return (await this.store.pool.query(`SELECT u.id,u.email,u.name,u.role,u.active,u.company_id,u.platform_admin,u.access_mode,u.extra_permissions,u.signature_default,u.accepts_ai_handoff,u.created_at,u.setup_expires_at,u.password_hash IS NOT NULL AS activated,COALESCE((SELECT json_agg(connection_id ORDER BY connection_id) FROM user_connections WHERE user_id=u.id),'[]'::json) AS connections,COALESCE((SELECT json_agg(group_id) FROM user_access_groups WHERE user_id=u.id),'[]'::json) AS group_ids FROM users u WHERE u.company_id=$1 AND ($2::boolean OR NOT u.platform_admin) ORDER BY u.created_at,u.email`,[companyId,!!actor?.platform_admin])).rows;}
 async save(body,actor,id=null){
  const name=typeof body.name==='string'?body.name.trim():'',email=typeof body.email==='string'?body.email.trim().toLowerCase():'';
  if(!name||name.length>100||!['admin','operator','viewer'].includes(body.role)||typeof body.active!=='boolean'||!/^\S+@\S+\.\S+$/.test(email)||email.length>254)throw error('Preencha nome, e-mail, perfil e situação válidos.');
  if(!Array.isArray(body.connections)||body.connections.some(id=>typeof id!=='string')||body.connections.length>1000)throw error('Selecione as conexões do usuário.');
  if(body.accepts_ai_handoff!==undefined&&typeof body.accepts_ai_handoff!=='boolean')throw error('Opção de recebimento automático inválida.');
  const companyId=actor.company_id||'default';
  const connections=[...new Set(body.connections)],groupIds=body.group_ids===undefined?null:body.group_ids,permissions=body.permissions===undefined?null:permissionList(body.permissions);if(groupIds!==null&&(!Array.isArray(groupIds)||groupIds.some(g=>!/^[-a-f0-9]{36}$/i.test(g))))throw error('Grupos inválidos.');if(body.access_mode!==undefined&&!['legacy','custom'].includes(body.access_mode))throw error('Modo de acesso inválido.');if(body.signature_default!==undefined&&typeof body.signature_default!=='boolean')throw error('Assinatura padrão inválida.');if(body.role!=='admin'&&!connections.length&&!groupIds?.length)throw error('Selecione ao menos uma conexão para este perfil.');
  const token=id?null:crypto.randomBytes(32).toString('hex'),userId=id||crypto.randomUUID();
  try{return await this.store.transaction(async tx=>{
   await tx.pool.query('SELECT pg_advisory_xact_lock(734915807)');
   if(connections.length&&(await tx.pool.query('SELECT id FROM whatsapp_connections WHERE id=ANY($1::text[]) AND company_id=$2',[connections,companyId])).rowCount!==connections.length)throw error('Uma das conexões não existe.');
   if(id){
    const {rows:[old]}=await tx.pool.query('SELECT id,email,role,active,platform_admin FROM users WHERE id=$1 AND company_id=$2 FOR UPDATE',[id,companyId]);if(!old)throw error('Usuário não encontrado.',404);
    if(old.platform_admin&&!actor.platform_admin)throw error('Este usuário é administrado pela plataforma.',403);
    if(old.email!==email)throw error('O e-mail de um usuário existente não pode ser alterado.');
    if(id===actor.id&&(!body.active||body.role!=='admin'))throw error('Você não pode desativar ou retirar seu próprio acesso de administrador.',409);
    if(old.active&&old.role==='admin'&&(!body.active||body.role!=='admin')&&!(await tx.pool.query("SELECT 1 FROM users WHERE role='admin' AND active AND id!=$1 AND company_id=$2",[id,companyId])).rowCount)throw error('Mantenha ao menos um administrador ativo.',409);
    await tx.pool.query('UPDATE users SET name=$2,role=$3,active=$4 WHERE id=$1',[id,name,body.role,body.active]);
    if(!body.active||old.role!==body.role)await tx.pool.query('DELETE FROM sessions WHERE user_id=$1',[id]);
   }else await tx.pool.query(`INSERT INTO users(id,email,name,role,active,setup_hash,company_id,setup_expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '24 hours')`,[userId,email,name,body.role,body.active,hash(token),companyId]);
   if(groupIds!==null){const groups=[...new Set(groupIds)];if(groups.length&&(await tx.pool.query('SELECT id FROM access_groups WHERE id=ANY($1::uuid[]) AND active AND company_id=$2',[groups,companyId])).rowCount!==groups.length)throw error('Um grupo está desativado ou não existe.');await tx.pool.query('DELETE FROM user_access_groups WHERE user_id=$1',[userId]);for(const g of groups)await tx.pool.query('INSERT INTO user_access_groups(user_id,group_id) VALUES($1,$2)',[userId,g]);}
   await tx.pool.query('UPDATE users SET access_mode=COALESCE($2,access_mode),extra_permissions=COALESCE($3::jsonb,extra_permissions),signature_default=COALESCE($4,signature_default) WHERE id=$1',[userId,body.access_mode||null,permissions===null?null:JSON.stringify(permissions),body.signature_default??null]);
   await tx.pool.query('UPDATE users SET accepts_ai_handoff=COALESCE($2,accepts_ai_handoff),handoff_available=CASE WHEN $2=false THEN false ELSE handoff_available END WHERE id=$1',[userId,body.accepts_ai_handoff??null]);
   await tx.pool.query('DELETE FROM user_connections WHERE user_id=$1',[userId]);
   if(body.role!=='admin')for(const connection of connections)await tx.pool.query('INSERT INTO user_connections(user_id,connection_id) VALUES($1,$2)',[userId,connection]);
   await tx.audit(id?'user_updated':'user_created',actor.id,{userId,role:body.role,active:body.active,connections:body.role==='admin'?'all':connections});
   return {id:userId,...(token?{invitation:this.invitation(email,token)}:{})};
  });}catch(e){if(e.code==='23505')throw error('Já existe um usuário com esse e-mail.',409);throw e;}
 }
 invitation(email,token){return this.publicUrl+'/#'+new URLSearchParams({setup:token,email}).toString();}
 async reset(id,actor){
  if(id===actor.id)throw error('Use Minha senha para alterar sua própria senha.',409);
  const token=crypto.randomBytes(32).toString('hex');return this.store.transaction(async tx=>{
   const {rows:[user]}=await tx.pool.query(`UPDATE users SET password_hash=NULL,setup_hash=$2,setup_expires_at=now()+interval '24 hours' WHERE id=$1 AND active AND company_id=$3 AND ($4::boolean OR NOT platform_admin) RETURNING email`,[id,hash(token),actor.company_id||'default',!!actor.platform_admin]);if(!user)throw error('Usuário não encontrado ou desativado.',404);
   await tx.pool.query('DELETE FROM sessions WHERE user_id=$1',[id]);await tx.audit('user_access_reset',actor.id,{userId:id});return {id,invitation:this.invitation(user.email,token)};
  });
 }
}
