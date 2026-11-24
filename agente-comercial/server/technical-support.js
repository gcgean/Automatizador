import crypto from 'node:crypto';
import {resolveAccess} from './access.js';
import {can} from '../shared/access.js';
import {canSeeLead} from './conversation-access.js';
const normal=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const TECHNICAL_SUPPORT_INSTRUCTIONS='\nPEDIDO DE SUPORTE TÉCNICO TEM PRIORIDADE SOBRE VENDA: se o cliente já usa o produto e relata erro, bloqueio, liberação, configuração ou dificuldade operacional, use solicitar_suporte_tecnico com um resumo fiel do pedido atual. A ferramenta coloca etiqueta, encaminha à equipe e notifica os responsáveis. Não continue qualificação comercial, convite para teste ou agenda de venda. Não peça novamente qual sistema usa se o contexto já identifica; detalhes indispensáveis podem ser levantados pela equipe. Não prometa que executou liberação, alteração fiscal ou correção: você não tem essa permissão no produto. Perguntas comerciais sobre existência/qualidade do suporte ou pedidos para liberar um teste não são chamados técnicos. Saudações, respostas automáticas e texto de imagem isolado não autorizam encaminhamento.';
export const TECHNICAL_SUPPORT_TOOL={name:'solicitar_suporte_tecnico',description:'Registra pedido técnico atual: etiqueta Suporte técnico, encaminha à equipe autorizada e cria alertas. Não executa alterações no sistema do cliente.',strict:true,input_schema:{type:'object',additionalProperties:false,required:['reason'],properties:{reason:{type:'string',description:'Resumo fiel e breve do problema técnico solicitado nesta mensagem.'}}}};
export function isTechnicalSupportRequest(text){
 const s=normal(text);
 if(/nao (?:quero|preciso) (?:de )?suporte|(?:tem|oferece|oferecem|inclui|como funciona o) suporte|liber(?:ar|e|acao).{0,20}(?:teste|demonstracao)/.test(s))return false;
 if(/\b(?:preciso|quero|chamar|acionar|falar com)\b.{0,30}\bsuporte(?: tecnico)?\b/.test(s))return true;
 const product=/nota|estoque|fiscal|sistema|senha|acesso|impress|xml|pdv|cadastro|login|nfe|nfse/.test(s);
 const action=/liber|desbloque|corrig|configur|erro|trav|nao (?:consigo|funciona|consegu|abre|entra|imprime)|parou de|continua sem/.test(s);
 const request=/preciso|poderia|pode |solicito|gostaria|ajud|auxili|nao consigo|nao estou conseguindo|esta dando|deu erro|erro ao|parou de|continua sem|nao funciona|nao abre/.test(s);
 return product&&action&&request&&!/se (?:eu )?contratar|antes de contratar|quero (?:um |conhecer o |conhecer um )sistema/.test(s);
}
export async function requestTechnicalSupport(store,phone,{reason,text,messageId,controlBefore}){
 if(!store.scoped||!store.pool||typeof reason!=='string'||!reason.trim()||reason.length>500||typeof text!=='string'||!text.trim()||/^(?:ola|oi|bom dia|boa tarde|boa noite)[!.,\s]*$/i.test(normal(text)))throw new Error('Registre apenas um pedido técnico atual e seu resumo.');
 return store.transaction(async tx=>{
  await tx.pool.query('SELECT pg_advisory_xact_lock(hashtext($1))',['tags:'+store.connectionId]);
  const lead=(await tx.pool.query('SELECT data FROM leads WHERE connection_id=$1 AND phone=$2 FOR UPDATE',[store.connectionId,phone])).rows[0]?.data,connection=await tx.getConnection();
  if(!lead||lead.optedOut||lead.conversationClosed||!connection.enabled||!connection.company_active||controlBefore!==undefined&&lead.humanControlId!==controlBefore)throw new Error('O atendimento mudou ou está indisponível.');
  let tag=(await tx.pool.query("SELECT id FROM contact_tags WHERE connection_id=$1 AND lower(name) IN ('suporte','suporte técnico','suporte tecnico') ORDER BY name LIMIT 1",[store.connectionId])).rows[0];
  if(!tag)tag=(await tx.pool.query("INSERT INTO contact_tags(id,connection_id,name,color) VALUES($1,$2,'Suporte técnico','orange') RETURNING id",[crypto.randomUUID(),store.connectionId])).rows[0];
  await tx.pool.query("INSERT INTO lead_tags(connection_id,phone,tag_id,source) VALUES($1,$2,$3,'ai_support') ON CONFLICT DO NOTHING",[store.connectionId,phone,tag.id]);
  if(String(lead.supportRequestTicketId)===String(lead.ticketId)&&lead.supportRequestNotifiedAt)return {handled:true,sendReply:false,notified:0,reused:true,controlId:lead.humanControlId};
  const alreadyHuman=lead.status==='encaminhado'||!!lead.assignedUserId;
  const departments=(await tx.pool.query('SELECT d.id,d.name FROM departments d JOIN department_connections dc ON dc.department_id=d.id WHERE dc.connection_id=$1 AND d.company_id=$2 AND d.active',[store.connectionId,connection.company_id])).rows.filter(d=>/suporte|assistencia tecnica|atendimento tecnico/.test(normal(d.name)));
  const departmentId=alreadyHuman?lead.departmentId:departments.length===1?departments[0].id:lead.departmentId;
  const controlId=alreadyHuman?lead.humanControlId:crypto.randomUUID();
  const updated=await tx.updateLead(phone,{status:'encaminhado',humanControlId:controlId,...(!alreadyHuman&&departmentId?{departmentId}:{}),supportRequestTicketId:lead.ticketId,supportRequestNotifiedAt:new Date().toISOString(),supportRequestSummary:reason.trim(),supportRequestMessageId:messageId||false});
  await tx.pool.query("UPDATE cadence_queue SET status='stopped',reason='Pedido de suporte técnico',updated_at=now() WHERE connection_id=$1 AND phone=$2 AND status IN ('waiting','queued','consent_required','awaiting_response','awaiting_delivery')",[store.connectionId,phone]);
  const people=(await tx.pool.query("SELECT u.*,COALESCE((SELECT json_agg(connection_id) FROM user_connections WHERE user_id=u.id),'[]') AS connections FROM users u WHERE u.company_id=$1 AND u.active AND (u.role='admin' OR u.id::text=$2 OR EXISTS(SELECT 1 FROM user_connections uc WHERE uc.user_id=u.id AND uc.connection_id=$3))",[connection.company_id,String(lead.assignedUserId||''),store.connectionId])).rows;
  let notified=0;
  for(const person of people){const user=await resolveAccess(tx.pool,person);if(!can(user,'conversations.view')||!can(user,'messages.send')||user.role!=='admin'&&!user.connections.includes(store.connectionId)||!canSeeLead(user,updated))continue;if(user.role!=='admin'&&updated.assignedUserId&&updated.assignedUserId!==user.id)continue;
   await tx.pool.query("INSERT INTO user_notifications(id,user_id,company_id,connection_id,phone,kind) VALUES($1,$2,$3,$4,$5,'support_request')",[crypto.randomUUID(),user.id,connection.company_id,store.connectionId,phone]);notified++;
  }
  await tx.recordEvent({id:crypto.randomUUID(),phone,direction:'out',actor:'system',kind:'support_request',state:'internal',text:'Pedido de suporte técnico identificado. '+reason.trim()});
  await tx.audit('technical_support_requested',null,{phone,ticketId:lead.ticketId,tagId:tag.id,notified,departmentId:updated.departmentId||null,messageId:messageId||null});
  return {handled:true,notified,controlId,sendReply:!alreadyHuman,reply:notified?'Identifiquei que seu pedido é de suporte técnico e avisei a equipe responsável com o que você descreveu. A equipe precisa avaliar a liberação; não fiz nenhuma alteração no seu sistema.':'Identifiquei seu pedido de suporte técnico e deixei registrado para a equipe conferir. Não fiz nenhuma alteração no seu sistema.'};
 });
}
