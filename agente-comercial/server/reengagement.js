import crypto from 'node:crypto';
import {can} from '../shared/access.js';
import {blockingJob} from '../shared/delivery.js';
import {TemplateCatalog,fillTemplate} from './message-templates.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export class Reengagement{
 constructor(store,registry,cadence,auth){this.store=store;this.registry=registry;this.cadence=cadence;this.auth=auth;this.catalog=new TemplateCatalog(registry,{fetchImpl:cadence.fetch});}
 async access(id,phone,operator){
  const user=await this.auth.identity(operator.id),scoped=this.store.scope(id),lead=await scoped.getLead(phone),connection=await scoped.getConnection();
  if(!user||!can(user,'messages.send')||(!user.platform_admin&&user.company_id!==connection.company_id)||(user.role!=='admin'&&!user.connections.includes(id))||(user.role!=='admin'&&lead?.assignedUserId&&lead.assignedUserId!==user.id))throw fail('Atendimento indisponível para seu usuário.',403);
  if(lead?.conversationClosed)throw fail('Conversa finalizada. Reabra antes de enviar um modelo.',409);
  if(!lead||lead.optedOut||lead.cadenceDeclined)throw fail('Contato bloqueado ou com recusa de acompanhamento registrada.',409);
  if(!connection.enabled||!connection.company_active)throw fail('Empresa ou conexão pausada.',409);
  const events=await scoped.getEvents(phone),open=events.some(e=>e.direction==='in'&&Date.now()-Date.parse(e.at)>=0&&Date.now()-Date.parse(e.at)<86400000);
  return {user,lead,scoped,open};
 }
 async template(id,name,language){const template=(await this.catalog.list(id)).find(t=>t.name===name&&t.language===language);if(!template)throw fail('O modelo escolhido não está aprovado ou disponível nesta WABA. Consulte a lista novamente.',409);if(!template.supported)throw fail(template.unsupported,409);return template;}
 async preview(id,phone,user){const {open}=await this.access(id,phone,user);if(open)return {windowOpen:true};const [templates,settings]=await Promise.all([this.catalog.list(id),this.cadence.settings(id)]),preferred=templates.find(t=>t.supported&&t.name===settings.template_name&&t.language===settings.language)||templates.find(t=>t.supported&&t.category==='MARKETING'&&!t.fields.length)||templates.find(t=>t.supported);return {windowOpen:false,...preferred,templates};}
 async enqueue(id,phone,body,user){
  if(this.registry.config.panelOnly)throw fail('Atendimento ainda não configurado.',503);
  if(!/^[a-f0-9-]{36}$/i.test(body.requestId||'')||body.consentConfirmed!==true)throw fail('Confirme a autorização do cliente e identifique este envio.');
  const runtime=await this.registry.runtime(id),messageId='manual-template-'+body.requestId,key=Buffer.from(messageId).toString('base64url'),existing=runtime.inbox.jobs[key];
  if(existing){if(existing.message.from!==phone||existing.message.operator?.id!==user.id||existing.message.reengagement?.name!==body.name||existing.message.reengagement?.language!==body.language||JSON.stringify(existing.message.reengagement?.values||{})!==JSON.stringify(body.values||{}))throw fail('Identificador já utilizado em outro envio.',409);return {queued:true,id:messageId};}
  const {open,lead,scoped}=await this.access(id,phone,user);if(open)throw fail('O cliente respondeu e a janela está aberta. Use o campo normal de mensagem.',409);
  if(blockingJob(runtime.inbox.jobs,phone))throw fail('Confira a pendência anterior antes de enviar outro modelo.',409);
  const template=await this.template(id,body.name,body.language);
  if(body.fingerprint&&body.fingerprint!==template.fingerprint)throw fail('O modelo mudou. Confira novamente a prévia.',409);
  const filled=fillTemplate(template,body.values||{});
  await scoped.updateLead(phone,{status:'encaminhado',humanControlId:crypto.randomUUID(),...(!lead.assignedUserId?{assignedUserId:user.id,assignedUserName:user.name||user.email}:{})});
  await runtime.inbox.accept({id:messageId,from:phone,text:filled.text,manual:true,operator:{id:user.id,name:user.name||user.email,administrator:user.role==='admin'},reengagement:{name:template.name,language:template.language,body:filled.text,fingerprint:template.fingerprint,values:filled.values,consentConfirmed:true}});
  await scoped.audit('manual_template_requested',user.id,{phone,template:template.name,consentConfirmed:true});return {queued:true,id:messageId};
 }
 async deliver(agent,phone,template,operator){
  if(this.registry.config.panelOnly)throw fail('Atendimento ainda não configurado.',503);
  const id=agent.store.connectionId,{open}=await this.access(id,phone,operator);
  if(open)throw fail('Cliente respondeu antes do envio. A janela está aberta; use uma mensagem normal.',409);
  if(template.consentConfirmed!==true)throw fail('Autorização de contato ausente.',409);
  const current=await this.template(id,template.name,template.language),filled=fillTemplate(current,template.values||{});
  if(template.fingerprint&&current.fingerprint!==template.fingerprint||filled.text!==template.body)throw fail('O modelo mudou depois da prévia. Confira antes de reenviar.',409);
  const {user}=await this.access(id,phone,operator);
  const result=await agent.whatsapp.sendTemplate(phone,filled.payload,filled.text,{actor:'human',operatorId:user.id,operatorName:user.name||user.email,templateName:current.name,signed:false});
  const conv=await agent.store.getConversation(phone);conv.pendingHuman??=[];conv.pendingHuman.push({id:'template-'+(result.messages?.[0]?.id||''),text:'Modelo aprovado enviado pelo atendente: '+filled.text,receivedAt:new Date().toISOString()});await agent.store.saveConversation(conv);return filled.text;
 }
}
