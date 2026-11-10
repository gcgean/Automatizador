export const canSeeLead=(user,lead)=>!user||user.role==='admin'||!lead?.assignedUserId||lead.assignedUserId===user.id;
export class ConversationAccess{
 constructor(store,user){this.store=store;this.user=user;}
 async allows(phone){return canSeeLead(this.user,await this.store.getLead(phone));}
 async assert(phone){if(!await this.allows(phone))throw Object.assign(new Error('Atendimento não encontrado ou indisponível para seu usuário.'),{status:404});}
 async leads(){return Object.fromEntries(Object.entries(await this.store.listLeads()).filter(([,lead])=>canSeeLead(this.user,lead)));}
 async filter(rows,phoneOf=row=>row.phone){
  if(!this.user||this.user.role==='admin')return rows;
  const leads=await this.store.listLeads();return rows.filter(row=>canSeeLead(this.user,leads[phoneOf(row)]));
 }
}
// Keep report and export visibility in SQL so hidden conversations never affect totals or limits.
export const visibilitySQL=(connection,phone,parameter)=>`NOT EXISTS (SELECT 1 FROM leads restricted WHERE restricted.connection_id=${connection} AND restricted.phone=${phone} AND NULLIF(NULLIF(restricted.data->>'assignedUserId','false'),'') IS NOT NULL AND restricted.data->>'assignedUserId'<>${parameter}::text)`;
