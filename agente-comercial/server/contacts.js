// Contatos: lista dos leads de todos os números do usuário, cadastro manual, importação e renomear.
import {canSeeLead} from './conversation-access.js';
import {setConversationClosed} from './conversation-lifecycle.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const cleanName=value=>typeof value==='string'?value.trim().replace(/\s+/g,' ').slice(0,120):'';

// Celular brasileiro sem DDI ganha 55; aceita formatos com +, espaços, traços e parênteses.
export function normalizePhone(value){
 let digits=String(value??'').replace(/\D/g,'');
 if(digits.startsWith('00'))digits=digits.slice(2);
 if(/^0[1-9]/.test(digits))digits=digits.slice(1);
 if(digits.length===10||digits.length===11)digits='55'+digits;
 return digits.length>=12&&digits.length<=15?digits:null;
}
// No WhatsApp, celulares brasileiros podem existir com ou sem o 9 após o DDD.
export function phoneVariants(phone){
 const v=new Set([phone]);
 if(/^55\d{2}9\d{8}$/.test(phone))v.add(phone.slice(0,4)+phone.slice(5));
 if(/^55\d{2}\d{8}$/.test(phone))v.add(phone.slice(0,4)+'9'+phone.slice(4));
 return [...v];
}
const displayName=d=>cleanName(d?.nome)||cleanName(d?.nomeWhatsApp)||'';

export class Contacts{
 constructor(store){this.store=store;}
 async existing(connectionId,phone){
  const {rows}=await this.store.pool.query('SELECT phone,data FROM leads WHERE connection_id=$1 AND phone=ANY($2)',[connectionId,phoneVariants(phone)]);
  return rows.find(r=>r.phone===phone)||rows[0]||null;
 }
 async list(user,connections,{q='',connectionId='',limit=100,offset=0}={}){
  const ids=connectionId?connections.filter(c=>c.id===connectionId).map(c=>c.id):connections.map(c=>c.id);
  limit=Math.min(Math.max(Number(limit)||100,1),200);offset=Math.max(Number(offset)||0,0);
  const term=String(q||'').trim().slice(0,80),digits=term.replace(/\D/g,'');
  const {rows}=await this.store.pool.query(`SELECT l.connection_id,l.phone,l.data,l.created_at,m.last_at,m.total,
    (SELECT t.closed_at IS NULL FROM service_tickets t WHERE t.connection_id=l.connection_id AND t.phone=l.phone ORDER BY t.id DESC LIMIT 1) AS ticket_open
   FROM leads l LEFT JOIN LATERAL(SELECT max(occurred_at) AS last_at,count(*)::int AS total FROM messages WHERE connection_id=l.connection_id AND phone=l.phone) m ON true
   WHERE l.connection_id=ANY($1) AND ($2='' OR l.data->>'nome' ILIKE '%'||$2||'%' OR l.data->>'nomeWhatsApp' ILIKE '%'||$2||'%' OR l.data->>'empresa' ILIKE '%'||$2||'%' OR ($3<>'' AND l.phone LIKE '%'||$3||'%'))
   ORDER BY COALESCE(m.last_at,l.created_at) DESC,l.phone LIMIT $4 OFFSET $5`,[ids,term,digits,limit+1,offset]);
  const names=new Map(connections.map(c=>[c.id,c]));
  const visible=rows.filter(r=>canSeeLead(user,r.data)).slice(0,limit);
  return {hasMore:rows.length>limit,items:visible.map(r=>({connectionId:r.connection_id,connectionName:names.get(r.connection_id)?.name||r.connection_id,connectionColor:names.get(r.connection_id)?.color||null,channel:names.get(r.connection_id)?.channel||'whatsapp',instagramUsername:r.data.instagramUsername||null,phone:r.phone,name:displayName(r.data),whatsappName:cleanName(r.data.nomeWhatsApp),company:cleanName(r.data.empresa),temperature:r.data.temperatura||null,ticketId:r.data.ticketId||null,conversationClosed:r.data.conversationClosed===true,hasOpenTicket:r.ticket_open===true&&r.data.conversationClosed!==true,messages:r.total||0,lastMessageAt:r.last_at,optedOut:r.data.optedOut===true,status:r.data.status||null,outcome:r.data.resultado||null,savedManually:!!r.data.contactSavedAt}))};
 }
 // Cadastro manual: não abre chamado. O chamado abre quando a equipe pedir ou quando o cliente escrever.
 async whatsappOnly(connectionId){const channel=(await this.store.getConnection(connectionId)).channel;if(channel==='youtube')throw fail('No YouTube não dá para cadastrar ou importar contatos: o atendimento começa quando alguém comenta em um vídeo do canal.');if(channel==='instagram')throw fail('No Instagram não dá para cadastrar ou importar contatos: a conversa começa quando o cliente escreve para a empresa.');}
 async save(connectionId,{phone,name,company},user){
  await this.whatsappOnly(connectionId);
  const normalized=normalizePhone(phone);if(!normalized)throw fail('Informe um telefone com DDD, por exemplo (88) 99999-0000.');
  const nome=cleanName(name);if(!nome)throw fail('Informe o nome do contato.');
  const found=await this.existing(connectionId,normalized),scoped=this.store.scope(connectionId);
  if(found&&!canSeeLead(user,found.data))throw fail('Contato indisponível para seu usuário.',404);
  if(found){const lead=await scoped.updateLead(found.phone,{nome,...(cleanName(company)?{empresa:cleanName(company)}:{}),contactRenamedAt:new Date().toISOString(),contactRenamedBy:user.id});return {created:false,phone:found.phone,lead};}
  const lead=await scoped.updateLead(normalized,{nome,...(cleanName(company)?{empresa:cleanName(company)}:{}),conversationClosed:true,contactSavedAt:new Date().toISOString(),contactSavedBy:user.id,contactSource:'manual'});
  await scoped.audit('contact_saved',user.id,{phone:normalized});return {created:true,phone:normalized,lead};
 }
 // Importação (arquivo .vcf/.csv ou agenda do celular): cria os novos e só preenche nome de quem ainda não tem.
 async import(connectionId,contacts,user){
  await this.whatsappOnly(connectionId);
  if(!Array.isArray(contacts)||!contacts.length)throw fail('Nenhum contato para importar.');
  if(contacts.length>5000)throw fail('Importe até 5.000 contatos por vez.');
  const result={created:0,named:0,unchanged:0,invalid:0},seen=new Set(),scoped=this.store.scope(connectionId),at=new Date().toISOString();
  for(const c of contacts){
   const phone=normalizePhone(c?.phone),nome=cleanName(c?.name);
   if(!phone||!nome||seen.has(phone)){result.invalid++;continue;}seen.add(phone);
   const found=await this.existing(connectionId,phone);
   if(found){if(cleanName(found.data.nome)){result.unchanged++;continue;}await scoped.updateLead(found.phone,{nome});result.named++;continue;}
   await scoped.updateLead(phone,{nome,conversationClosed:true,contactSavedAt:at,contactSavedBy:user.id,contactSource:'import'});result.created++;
  }
  await scoped.audit('contacts_imported',user.id,result);return result;
 }
 async rename(connectionId,phone,name,user){
  const nome=cleanName(name);if(!nome)throw fail('Informe o nome do contato.');
  const scoped=this.store.scope(connectionId);if(!await scoped.getLead(phone))throw fail('Contato não encontrado.',404);
  return scoped.updateLead(phone,{nome,contactRenamedAt:new Date().toISOString(),contactRenamedBy:user.id});
 }
 // Abrir chamado a partir da lista: reabre se estava finalizado; se não houver conversa, marca para aparecer em Atendimentos.
 async open(connectionId,phone,user,jobs){
  const scoped=this.store.scope(connectionId),lead=await scoped.getLead(phone);if(!lead)throw fail('Contato não encontrado.',404);
  if(lead.conversationClosed)return setConversationClosed(scoped,phone,false,user,jobs);
  return scoped.updateLead(phone,{conversationReopenedAt:new Date().toISOString(),conversationReopenedBy:user.id});
 }
}
