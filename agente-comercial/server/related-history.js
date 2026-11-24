import {phoneVariants} from './contacts.js';
import {canSeeLead} from './conversation-access.js';
import {can} from '../shared/access.js';
const denied=()=>Object.assign(new Error('Histórico indisponível para seu acesso.'),{status:403});
export async function relatedHistory(store,registry,user,connectionId,phone,sourceId=null){
 if(!user||!can(user,'conversations.view')||!/^\d{10,15}$/.test(phone))throw denied();
 const allowed=(await registry.list()).filter(c=>c.companyId===user.company_id&&(!c.channel||c.channel==='whatsapp')&&(user.role==='admin'||user.connections.includes(c.id)));
 if(!allowed.some(c=>c.id===connectionId)||!canSeeLead(user,await store.scope(connectionId).getLead(phone)))throw denied();
 const variants=phoneVariants(phone),sources=[];
 for(const connection of allowed){
  if(sourceId&&connection.id!==sourceId)continue;
  const scoped=store.scope(connection.id),phones=[];
  for(const alias of variants){if(connection.id===connectionId&&alias===phone)continue;if(canSeeLead(user,await scoped.getLead(alias)))phones.push(alias);}
  if(!phones.length)continue;
  const counts=(await store.pool.query(`SELECT count(*)::int AS total FROM (SELECT COALESCE(NULLIF(data->>'messageId',''),id) AS message_key FROM messages WHERE connection_id=$1 AND phone=ANY($2::text[]) UNION SELECT COALESCE(NULLIF(data->>'messageId',''),id) AS message_key FROM business_app_history WHERE connection_id=$1 AND phone=ANY($2::text[])) h`,[connection.id,phones])).rows[0].total;
  if(!counts)continue;
  const source={id:connection.id,name:connection.name,displayPhone:connection.displayPhone,total:counts};
  if(sourceId){const events=[];for(const alias of phones)events.push(...await scoped.conversationEvents(alias));const unique=new Map();for(const event of events)if(!unique.has(event.messageId||event.id))unique.set(event.messageId||event.id,event);return {...source,readOnly:true,events:[...unique.values()].sort((a,b)=>Date.parse(a.at)-Date.parse(b.at))};}
  sources.push(source);
 }
 if(sourceId)throw denied();return {sources};
}
