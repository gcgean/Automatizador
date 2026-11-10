import crypto from 'node:crypto';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export const TAG_COLORS=['green','blue','purple','pink','yellow','orange','red','gray'];
export class TagService{
 constructor(store){this.store=store;this.connection=store.connectionId;}
 async list(){return (await this.store.pool.query('SELECT id,name,color FROM contact_tags WHERE connection_id=$1 ORDER BY lower(name),id',[this.connection])).rows;}
 async create(body){
  const name=typeof body.name==='string'?body.name.trim().replace(/\s+/g,' '):'';
  if(!name||name.length>40||!TAG_COLORS.includes(body.color))throw fail('Informe o nome da etiqueta (até 40 caracteres) e uma cor válida.');
  try{return await this.store.transaction(async tx=>{await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))',['tags:'+this.connection]);if(Number((await tx.pool.query('SELECT count(*) FROM contact_tags WHERE connection_id=$1',[this.connection])).rows[0].count)>=100)throw fail('Limite de 100 etiquetas por conexão.',409);return (await tx.pool.query('INSERT INTO contact_tags(id,connection_id,name,color) VALUES($1,$2,$3,$4) RETURNING id,name,color',[crypto.randomUUID(),this.connection,name,body.color])).rows[0];});}
  catch(e){if(e.code==='23505')throw fail('Já existe uma etiqueta com esse nome.',409);throw e;}
 }
 async assign(phone,ids){
  if(!Array.isArray(ids)||ids.length>10||ids.some(id=>typeof id!=='string'||!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)))throw fail('Selecione até 10 etiquetas válidas.');
  ids=[...new Set(ids)];
  return this.store.transaction(async tx=>{
   const lead=(await tx.pool.query('SELECT 1 FROM leads WHERE connection_id=$1 AND phone=$2 FOR UPDATE',[this.connection,phone])).rowCount;if(!lead)throw fail('Contato não encontrado.',404);
   if((await tx.pool.query('SELECT id FROM contact_tags WHERE connection_id=$1 AND id=ANY($2::uuid[])',[this.connection,ids])).rowCount!==ids.length)throw fail('Escolha etiquetas desta conexão.');
   await tx.pool.query('DELETE FROM lead_tags WHERE connection_id=$1 AND phone=$2',[this.connection,phone]);
   if(ids.length)await tx.pool.query('INSERT INTO lead_tags(connection_id,phone,tag_id) SELECT $1,$2,unnest($3::uuid[])',[this.connection,phone,ids]);
   return {ok:true};
  });
 }
 async decorate(leads){
  const phones=Object.keys(leads);if(!phones.length)return leads;
  const rows=(await this.store.pool.query('SELECT lt.phone,t.id,t.name,t.color FROM lead_tags lt JOIN contact_tags t ON t.connection_id=lt.connection_id AND t.id=lt.tag_id WHERE lt.connection_id=$1 AND lt.phone=ANY($2::text[]) ORDER BY lower(t.name),t.id',[this.connection,phones])).rows;
  const tags=new Map();for(const {phone,...tag} of rows){if(!tags.has(phone))tags.set(phone,[]);tags.get(phone).push(tag);}
  return Object.fromEntries(Object.entries(leads).map(([phone,lead])=>[phone,{...lead,tags:tags.get(phone)||[]}]));
 }
}
