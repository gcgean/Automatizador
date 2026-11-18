import crypto from 'node:crypto';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const NO_INTERACTION='no_interaction';
export const NO_INTERACTION_NAME='Falta de interação';
export const NO_INTEREST='no_interest',OPT_OUT='opt_out';
export const SYSTEM_REASONS={[NO_INTERACTION]:NO_INTERACTION_NAME,[NO_INTEREST]:'Cliente sem interesse',[OPT_OUT]:'Pediu para não ser contatado'};
// Motivo automático (cadência ou IA); reaproveita um motivo de mesmo nome criado pela equipe.
export async function systemReason(db,companyId,key=NO_INTERACTION){
 const label=SYSTEM_REASONS[key];if(!label)throw new Error('Motivo automático desconhecido.');
 const found=await db.query('SELECT id FROM closure_reasons WHERE company_id=$1 AND system_key=$2',[companyId,key]);if(found.rowCount)return found.rows[0].id;
 const named=await db.query('UPDATE closure_reasons SET system_key=$3 WHERE company_id=$1 AND lower(name)=lower($2) AND system_key IS NULL RETURNING id',[companyId,label,key]);if(named.rowCount)return named.rows[0].id;
 const {rows:[row]}=await db.query('INSERT INTO closure_reasons(id,company_id,name,system_key) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING id',[crypto.randomUUID(),companyId,label,key]);
 return row?.id||(await db.query('SELECT id FROM closure_reasons WHERE company_id=$1 AND system_key=$2',[companyId,key])).rows[0].id;
}
export async function companyOf(db,connectionId){return (await db.query('SELECT company_id FROM whatsapp_connections WHERE id=$1',[connectionId])).rows[0]?.company_id||'default';}
// Confere os motivos escolhidos e se a empresa exige ao menos um.
export async function validateClosureReasons(db,companyId,ids=[]){
 if(ids==null)ids=[];
 if(!Array.isArray(ids)||ids.length>20||ids.some(id=>typeof id!=='string'||!UUID.test(id)))throw fail('Motivo de finalização inválido.');
 ids=[...new Set(ids.map(id=>id.toLowerCase()))];
 const [{rows},{rows:[company]}]=await Promise.all([ids.length?db.query('SELECT id,name FROM closure_reasons WHERE company_id=$1 AND active AND id=ANY($2::uuid[])',[companyId,ids]):{rows:[]},db.query('SELECT require_closure_reason FROM companies WHERE id=$1',[companyId])]);
 if(rows.length!==ids.length)throw fail('Um dos motivos escolhidos não está mais disponível. Atualize e tente de novo.');
 if(company?.require_closure_reason&&!rows.length)throw fail('Informe o motivo da finalização.');
 return rows;
}
export async function recordClosureReasons(db,ticketId,reasonIds,actorId=null){
 if(!ticketId||!reasonIds.length)return;
 await db.query('INSERT INTO ticket_closure_reasons(ticket_id,reason_id,actor_id) SELECT $1,unnest($2::uuid[]),$3 ON CONFLICT DO NOTHING',[ticketId,reasonIds,actorId]);
}
export class ClosureReasons{
 constructor(pool){this.pool=pool;}
 async list(companyId,all=false){
  for(const key of Object.keys(SYSTEM_REASONS))await systemReason(this.pool,companyId,key);
  const [{rows},{rows:[company]}]=await Promise.all([this.pool.query(`SELECT id,name,active,system_key FROM closure_reasons WHERE company_id=$1${all?'':' AND active'} ORDER BY system_key IS NOT NULL,lower(name)`,[companyId]),this.pool.query('SELECT require_closure_reason FROM companies WHERE id=$1',[companyId])]);
  return {required:!!company?.require_closure_reason,reasons:rows.map(r=>({id:r.id,name:r.name,active:r.active,system:!!r.system_key}))};
 }
 async save(companyId,body,id=null){
  const name=typeof body.name==='string'?body.name.trim().replace(/\s+/g,' '):'';
  if(name.length<1||name.length>80)throw fail('Informe um nome de até 80 caracteres.');
  if(body.active!==undefined&&typeof body.active!=='boolean')throw fail('Situação do motivo inválida.');
  try{
   if(id){
    if(!UUID.test(id))throw fail('Motivo não encontrado.',404);
    const {rows:[current]}=await this.pool.query('SELECT system_key FROM closure_reasons WHERE id=$1 AND company_id=$2',[id,companyId]);
    if(!current)throw fail('Motivo não encontrado.',404);
    if(current.system_key&&body.active===false)throw fail('Este motivo é usado automaticamente pelo sistema e não pode ser desativado.');
    await this.pool.query('UPDATE closure_reasons SET name=$3,active=COALESCE($4,active) WHERE id=$1 AND company_id=$2',[id,companyId,name,body.active??null]);
   }else await this.pool.query('INSERT INTO closure_reasons(id,company_id,name) VALUES($1,$2,$3)',[crypto.randomUUID(),companyId,name]);
  }catch(e){if(e.code==='23505')throw fail('Já existe um motivo com esse nome.');throw e;}
  return this.list(companyId,true);
 }
 async setRequired(companyId,required){
  if(typeof required!=='boolean')throw fail('Informe se o motivo é obrigatório.');
  await this.pool.query('UPDATE companies SET require_closure_reason=$2 WHERE id=$1',[companyId,required]);
  return this.list(companyId,true);
 }
 // Chamados finalizados no período, por motivo. Um chamado com dois motivos conta em cada um deles.
 async report(connectionIds,from,to){
  const [{rows},{rows:[totals]}]=await Promise.all([
   this.pool.query(`SELECT r.id,r.name,r.system_key,count(DISTINCT t.id)::int AS total FROM service_tickets t JOIN ticket_closure_reasons x ON x.ticket_id=t.id JOIN closure_reasons r ON r.id=x.reason_id
    WHERE t.connection_id=ANY($1) AND t.closed_at>=$2 AND t.closed_at<$3 GROUP BY r.id,r.name,r.system_key ORDER BY total DESC,lower(r.name)`,[connectionIds,from,to]),
   this.pool.query(`SELECT count(*)::int AS closed,count(*) FILTER(WHERE NOT EXISTS(SELECT 1 FROM ticket_closure_reasons x WHERE x.ticket_id=t.id))::int AS without_reason
    FROM service_tickets t WHERE t.connection_id=ANY($1) AND t.closed_at>=$2 AND t.closed_at<$3`,[connectionIds,from,to])]);
  return {closed:totals.closed,withoutReason:totals.without_reason,reasons:rows.map(r=>({id:r.id,name:r.name,system:!!r.system_key,total:r.total}))};
 }
}
