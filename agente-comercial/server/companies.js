import crypto from 'node:crypto';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export class Companies{
 constructor(store){this.store=store;}
 async list(user){return (await this.store.pool.query('SELECT id,name,document,contact_email,active,created_at,updated_at FROM companies WHERE ($1::boolean OR id=$2) ORDER BY created_at,id',[!!user.platform_admin,user.company_id])).rows;}
 async save(body,user,id=null){
  if(!user.platform_admin)throw fail('Somente o administrador da plataforma pode cadastrar ou alterar empresas.',403);
  const name=typeof body.name==='string'?body.name.trim():'',document=typeof body.document==='string'?body.document.trim():'',email=typeof body.contact_email==='string'?body.contact_email.trim():'';
  if(!name||name.length>150||document.length>30||email.length>254||email&&!/^\S+@\S+\.\S+$/.test(email)||typeof body.active!=='boolean')throw fail('Confira nome, documento, e-mail e situação da empresa.');
  const companyId=id||crypto.randomUUID();
  return this.store.transaction(async tx=>{
   if(id){
    if(id===user.company_id&&!body.active)throw fail('Selecione outra empresa antes de suspender esta.',409);
    if(!(await tx.pool.query('UPDATE companies SET name=$2,document=$3,contact_email=$4,active=$5,updated_at=now() WHERE id=$1 RETURNING id',[id,name,document,email,body.active])).rowCount)throw fail('Empresa não encontrada.',404);
    if(!body.active)await tx.pool.query('DELETE FROM sessions WHERE user_id IN (SELECT id FROM users WHERE company_id=$1 AND NOT platform_admin)',[id]);
   }else await tx.pool.query('INSERT INTO companies(id,name,document,contact_email,active) VALUES($1,$2,$3,$4,$5)',[companyId,name,document,email,body.active]);
   await tx.audit(id?'company_updated':'company_created',user.id,{companyId,active:body.active});return {id:companyId};
  });
 }
 async assertConnection(companyId,connectionId){
  if(!(await this.store.pool.query('SELECT 1 FROM whatsapp_connections WHERE id=$1 AND company_id=$2',[connectionId,companyId])).rowCount)throw fail('Conexão não encontrada nesta empresa.',404);
 }
}
