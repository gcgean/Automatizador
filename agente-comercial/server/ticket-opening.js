import crypto from 'node:crypto';
import {Contacts,normalizePhone} from './contacts.js';
import {can} from '../shared/access.js';
import {canSeeLead} from './conversation-access.js';
import {blockingJob} from '../shared/delivery.js';
import {chooseAutomaticTemplate} from './reengagement.js';
import {transferTicket} from './tickets.js';
import {UNDELIVERABLE_MESSAGE} from './undeliverable.js';
const fail=(message,status=409)=>Object.assign(new Error(message),{status});
// Modelo com um único campo livre no corpo: quando aprovado pela Meta, leva a mensagem digitada mesmo fora da janela de 24h.
export const CUSTOM_OPENING_TEMPLATE='abertura_personalizada_v1';
export function customOpeningTemplate(templates,language='pt_BR'){return templates.find(t=>t.name===CUSTOM_OPENING_TEMPLATE&&t.supported&&t.language===language&&!t.header&&t.fields.length===1&&t.fields[0].id==='body:1')||null;}
// Variável de modelo não aceita quebra de linha nem tabulação; vira uma linha só.
export const singleLine=text=>String(text||'').replace(/\s*[\r\n\t]+\s*/g,' ').replace(/ {2,}/g,' ').trim();
// O modelo de texto livre já cumprimenta e apresenta a empresa; tira do começo do texto digitado só frases que repetiriam isso.
const GREETING=[/^(?:ol[aá]|oi+|opa|e a[ií]|bom dia|boa tarde|boa noite)(?!\p{L})[\p{L}\s,]{0,40}$/iu,/^(?:tudo bem|tudo bom|tudo certo|como vai|como voc[eê] est[aá])(?!\p{L})[\p{L}\s,]{0,25}$/iu,/^(?:aqui [eé]|sou|falo)\s+(?:d[aoe]s?\s+)?(?:equipe\s+(?:comercial\s+)?(?:d[aoe]\s+)?)?(?:a\s+|o\s+)?(?:command|cilos)(?!\p{L})[\p{L}\s]{0,30}$/iu];
export function stripGreeting(text){
 let rest=String(text||'').trim();
 for(let i=0;i<4;i++){const m=rest.match(/^([^.!?]{1,80}?)[.!?]+\s*/u);if(!m||!GREETING.some(re=>re.test(m[1].trim())))break;rest=rest.slice(m[0].length);}
 rest=rest.trim();return rest?rest.charAt(0).toUpperCase()+rest.slice(1):String(text||'').trim();
}
const normalized=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export function chooseOpeningTemplate(templates,settings,context,{hasHistory=false}={}){
 const topics=[/oficina|ordens? de servico/,/loja|varej|frente de caixa|pdv/,/nf[ -]?e|nota fiscal de produto/,/nfs[ -]?e|nota fiscal de servico/,/contador|contabil/,/frota/,/estoque/],wanted=normalized(context);
 const eligible=templates.filter(t=>!topics.some(re=>re.test(normalized(t.body))&&!re.test(wanted))&&t.supported&&t.category==='MARKETING'&&!t.fields.length&&!t.header&&t.language===(settings.language||'pt_BR')&&!/encerr|despedida|ultima tentativa|por enquanto|agendad|confirmad|pagamento|vencimento|boleto|codigo de/.test(normalized(t.body))&&(hasHistory||!/retom|conversamos|nos falamos|continuar nossa|ficou alguma/.test(normalized(t.body))));
 const selected=chooseAutomaticTemplate(eligible,settings,context);
 return eligible.filter(t=>/ola|oi\b|bom dia|boa tarde|boa noite|conhecer|informacoes/.test(normalized(t.body))).map(t=>({t,score:(t===selected?2:0)+(t.buttons.length?1:0)+(!/enviar.*(?:oferta|link)|mostrar.*oferta|ver oferta/.test(wanted)&&/\?/.test(t.body)&&t.body.length<=320&&!/conheca|veja|oferta|link|assin|contrat/.test(normalized(t.body))?10:0)+topics.reduce((n,re)=>n+(re.test(wanted)&&re.test(normalized(t.body))?6:0),0)+normalized(context).split(/\W+/).filter(w=>w.length>3&&normalized(t.body).includes(w)).length})).sort((a,b)=>b.score-a.score||a.t.name.localeCompare(b.t.name))[0]?.t||null;
}
export class TicketOpening{
 constructor(store,registry,reengagement,cadence,auth){Object.assign(this,{store,registry,reengagement,cadence,auth});this.contacts=new Contacts(store);}
 async inspect(body,operator){
  if(body.purpose!==undefined&&(typeof body.purpose!=='string'||body.purpose.length>500))throw fail('Descreva o objetivo em até 500 caracteres.',400);
  if(body.message!==undefined&&(typeof body.message!=='string'||body.message.length>1000))throw fail('Escreva a mensagem em até 1.000 caracteres.',400);
  const message=(body.message||'').trim();
  const user=await this.auth.identity(operator.id),id=body.connectionId,connection=await this.store.getConnection(id);
  if(!user||!can(user,'leads.manage')||!can(user,'conversations.transfer')||!can(user,'messages.send')||connection.company_id!==user.company_id||user.role!=='admin'&&!user.connections.includes(id))throw fail('Seu acesso não permite abrir chamado e enviar mensagem nesta conexão.',403);
  if(!connection.enabled||!connection.company_active)throw fail('Empresa ou conexão pausada.');
  if(connection.channel&&connection.channel!=='whatsapp')throw fail('Abertura por modelo disponível somente no WhatsApp.');
  const phone=normalizePhone(body.phone);if(!phone)throw fail('Informe um telefone com DDD.',400);
  const found=await this.contacts.existing(id,phone),lead=found?.data;
  if(lead&&!canSeeLead(user,lead))throw fail('Contato indisponível para seu usuário.',403);
  if(lead?.optedOut||lead?.cadenceDeclined)throw fail('Contato bloqueado ou com recusa de acompanhamento registrada.');
  if(lead?.undeliverableNumber)throw fail(UNDELIVERABLE_MESSAGE);
  const target=found?.phone||phone,scoped=this.store.scope(id),events=await scoped.getEvents(target),windowOpen=events.some(e=>e.direction==='in'&&Date.now()-Date.parse(e.at)>=0&&Date.now()-Date.parse(e.at)<86400000);
  const runtime=await this.registry.runtime(id);
  if(blockingJob(runtime.inbox.jobs,target))throw fail('Confira o envio pendente deste contato antes de iniciar outro.');
  const result={user,id,phone:target,scoped,lead,events,windowOpen,runtime,message};
  if(windowOpen)return result;
  if(events.some(e=>e.direction==='out'&&e.automaticTemplate&&Date.now()-Date.parse(e.at)<86400000))throw fail('Um modelo automático já foi enviado. Aguarde a resposta do cliente.');
  if(Object.values(runtime.inbox.jobs).some(j=>j.message.from===target&&j.message.reengagement&&['queued','processing','attention'].includes(j.status)))throw fail('Já existe um modelo pendente para este contato.');
  const catalog=await this.reengagement.catalog.list(id),settings=await this.cadence.settings(id);
  if(message){const custom=customOpeningTemplate(catalog,settings.language||'pt_BR');if(custom){result.template=custom;result.custom=stripGreeting(singleLine(message));return result;}result.customUnavailable=true;}
  const context=[message,body.purpose,lead?.produtos_interesse,lead?.dor_principal,...events.filter(e=>e.direction==='in').slice(-2).map(e=>e.text)].filter(Boolean).join(' ').slice(0,2000);
  result.template=chooseOpeningTemplate(catalog,settings,context,{hasHistory:events.some(e=>e.direction==='in')});
  if(!result.template)throw fail('Nenhum modelo aprovado compatível com esta abertura. Abra sem enviar ou confira os modelos na conversa.');
  return result;
 }
 async preview(body,user){const r=await this.inspect(body,user);return {phone:r.phone,windowOpen:r.windowOpen,consentRequired:!r.windowOpen,sendsText:r.windowOpen&&!!r.message,custom:!!r.custom,customUnavailable:!!r.customUnavailable,template:r.template?{name:r.template.name,language:r.template.language,body:r.custom?r.template.body.replace('{{1}}',r.custom):r.template.body,buttons:r.template.buttons,fingerprint:r.template.fingerprint}:null};}
 async activateAI(r,body,expectedControl){
  if(body.aiOnReply!==true)return;
  if(!expectedControl)return;
  await r.scoped.transaction(async tx=>{const row=(await tx.pool.query('SELECT data FROM leads WHERE connection_id=$1 AND phone=$2 FOR UPDATE',[r.id,r.phone])).rows[0];const current=row?.data;if(!current||current.humanControlId!==expectedControl||current.optedOut||current.cadenceDeclined||current.conversationClosed)return;
   await tx.updateLead(r.phone,{status:'em_conversa',assignedUserId:false,assignedUserName:false,humanControlId:crypto.randomUUID(),prospectingAI:true});await tx.audit('ticket_opening_ai_enabled',r.user.id,{phone:r.phone});
  });
 }

 async start(body,operator){
  if(!/^[a-f0-9-]{36}$/i.test(body.requestId||''))throw fail('Identifique esta abertura.',400);
  const signature=crypto.createHash('sha256').update(JSON.stringify({phone:normalizePhone(body.phone),name:body.name||'',departmentId:body.departmentId,userId:body.userId||null,purpose:body.purpose||'',message:(body.message||'').trim(),aiOnReply:body.aiOnReply===true})).digest('hex');
  const runtime=await this.registry.runtime(body.connectionId),existing=runtime.inbox.jobs[Buffer.from('manual-template-'+body.requestId).toString('base64url')];
  if(existing){if(existing.message.operator?.id!==operator.id||existing.message.reengagement?.openingRequest!==signature)throw fail('Identificador utilizado em outra abertura.');const check=await this.auth.identity(operator.id),connection=await this.store.getConnection(body.connectionId);if(!can(check,'messages.send')||check.company_id!==connection.company_id||check.role!=='admin'&&!check.connections.includes(body.connectionId))throw fail('Acesso alterado.',403);return {phone:existing.message.from,lead:await this.store.scope(body.connectionId).getLead(existing.message.from),queued:true,reused:true};}
  const r=await this.inspect(body,operator);
  if(!r.lead&&(!body.createContact||typeof body.name!=='string'||!body.name.trim()))throw fail('Cadastre o contato com nome e telefone.',400);
  if(!r.windowOpen&&(body.consentConfirmed!==true||body.fingerprint!==r.template.fingerprint))throw fail(body.consentConfirmed!==true?'Confirme que o cliente autorizou este contato pelo WhatsApp.':'O modelo mudou. Confira a nova prévia.');
  const person=body.userId?await this.auth.identity(body.userId):null;
  if(body.userId&&(!person||person.company_id!==r.user.company_id||!(person.role==='admin'||person.connections.includes(r.id))||!can(person,'messages.send')||!(await this.store.pool.query('SELECT 1 FROM users WHERE id=$1 AND password_hash IS NOT NULL',[person.id])).rowCount))throw fail('Escolha um atendente ativo com acesso ao número.',400);
  if(!r.windowOpen&&r.user.role!=='admin'&&person&&person.id!==r.user.id)throw fail('Para iniciar o envio como vendedor, selecione você como responsável. Depois poderá transferir.');
  const department=(await this.store.pool.query('SELECT d.id FROM departments d JOIN department_connections c ON c.department_id=d.id WHERE d.id::text=$1 AND c.connection_id=$2 AND d.active',[String(body.departmentId||''),r.id])).rows[0];
  if(!department||person&&!(await this.store.pool.query('SELECT 1 FROM department_users WHERE department_id=$1 AND user_id=$2',[department.id,person.id])).rowCount)throw fail('Escolha um setor permitido e um responsável vinculado.',400);
  if(!r.lead)await this.contacts.save(r.id,{phone:r.phone,name:body.name},r.user);
  const lead=await this.contacts.open(r.id,r.phone,r.user,r.runtime.inbox.jobs);
  await transferTicket(r.scoped,r.phone,{departmentId:department.id,ticketId:lead.ticketId,opening:true},person,r.user);
  const openedControl=(await r.scoped.getLead(r.phone)).humanControlId;
  await this.cadence.stop(r.id,r.phone,'Chamado aberto pela equipe');
  if(r.windowOpen){
   if(r.message)await r.runtime.inbox.accept({id:'manual-opening-'+body.requestId,from:r.phone,text:r.message,manual:true,operator:{id:r.user.id,name:String(r.user.name||r.user.email||'Equipe').replace(/[\r\n*_~`]/g,'').trim().slice(0,100),signed:false,administrator:r.user.role==='admin'}});
   await this.activateAI(r,body,openedControl);return {phone:r.phone,lead:await r.scoped.getLead(r.phone),windowOpen:true,queued:!!r.message,sentText:!!r.message};}
  try{const sent=await this.reengagement.enqueue(r.id,r.phone,{requestId:body.requestId,name:r.template.name,language:r.template.language,fingerprint:r.template.fingerprint,values:r.custom?{'body:1':r.custom}:{},consentConfirmed:true,automatic:true,openingRequest:signature,preserveAssignment:true},r.user);await this.activateAI(r,body,sent.humanControlId);return {...sent,phone:r.phone,lead:await r.scoped.getLead(r.phone),template:r.template.name};}
  catch(e){return {phone:r.phone,lead:await r.scoped.getLead(r.phone),queued:false,opened:true,error:e.message};}
 }
}
