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
 async automatic(id,phone,body,user){
  const review=await this.access(id,phone,user);if(review.lead.cadenceReviewRequired)throw fail('Confirme a autorização em Retomar com modelo aprovado antes de enviar.',409);
  const runtime=await this.registry.runtime(id),existing=runtime.inbox.jobs[Buffer.from('manual-template-'+body.requestId).toString('base64url')];
  if(existing){if(existing.message.from!==phone||existing.message.operator?.id!==user.id||existing.message.reengagement?.originalText!==body.text)throw fail('Identificador já utilizado em outro envio.',409);return {queued:true,automaticTemplate:true};}
  const events=await this.store.scope(id).getEvents(phone);
  if(events.some(e=>e.direction==='out'&&e.automaticTemplate&&Date.now()-Date.parse(e.at)<86400000)||Object.values(runtime.inbox.jobs).some(j=>j.message.from===phone&&j.message.reengagement?.automatic&&['queued','processing','attention'].includes(j.status)))throw fail('Uma retomada já foi enviada ou está na fila. Aguarde a resposta do cliente; seu texto permanece no rascunho.',409);
  const settings=await this.cadence.settings(id),template=chooseAutomaticTemplate(await this.catalog.list(id),settings,body.text);
  if(!template)throw fail('Nenhum modelo de retomada compatível está aprovado nesta conexão. Seu texto continua no rascunho.',409);
  return {...await this.enqueue(id,phone,{requestId:body.requestId,name:template.name,language:template.language,values:{},fingerprint:template.fingerprint,automatic:true,originalText:body.text},user),automaticTemplate:true};
 }
 async enqueue(id,phone,body,user){
  if(this.registry.config.panelOnly)throw fail('Atendimento ainda não configurado.',503);
  if(!/^[a-f0-9-]{36}$/i.test(body.requestId||'')||body.consentConfirmed!==true&&body.automatic!==true)throw fail('Confirme a autorização do cliente e identifique este envio.');
  const runtime=await this.registry.runtime(id),messageId='manual-template-'+body.requestId,key=Buffer.from(messageId).toString('base64url'),existing=runtime.inbox.jobs[key];
  if(existing){if(existing.message.from!==phone||existing.message.operator?.id!==user.id||existing.message.reengagement?.name!==body.name||existing.message.reengagement?.language!==body.language||JSON.stringify(existing.message.reengagement?.values||{})!==JSON.stringify(body.values||{}))throw fail('Identificador já utilizado em outro envio.',409);return {queued:true,id:messageId};}
  const {open,lead,scoped}=await this.access(id,phone,user);if(lead.cadenceReviewRequired&&body.consentConfirmed!==true)throw fail('Confirme a autorização do cliente para esta retomada.',409);if(open)throw fail('O cliente respondeu e a janela está aberta. Use o campo normal de mensagem.',409);
  if(blockingJob(runtime.inbox.jobs,phone))throw fail('Confira a pendência anterior antes de enviar outro modelo.',409);
  const template=await this.template(id,body.name,body.language);
  if(body.fingerprint&&body.fingerprint!==template.fingerprint)throw fail('O modelo mudou. Confira novamente a prévia.',409);
  const filled=fillTemplate(template,body.values||{});
  const humanControlId=crypto.randomUUID();
  await scoped.updateLead(phone,{status:'encaminhado',humanControlId,...(!lead.assignedUserId&&!body.preserveAssignment?{assignedUserId:user.id,assignedUserName:user.name||user.email}:{})});
  await runtime.inbox.accept({id:messageId,from:phone,text:filled.text,manual:true,operator:{id:user.id,name:user.name||user.email,administrator:user.role==='admin'},reengagement:{name:template.name,language:template.language,body:filled.text,fingerprint:template.fingerprint,values:filled.values,consentConfirmed:body.consentConfirmed===true,automatic:body.automatic===true,originalText:body.automatic?body.originalText:undefined,...(body.openingRequest?{openingRequest:body.openingRequest}:{})}});
  await scoped.audit('manual_template_requested',user.id,{phone,template:template.name,consentConfirmed:body.consentConfirmed===true,automatic:body.automatic===true});return {queued:true,id:messageId,humanControlId};
 }
 async deliver(agent,phone,template,operator){
  if(this.registry.config.panelOnly)throw fail('Atendimento ainda não configurado.',503);
  const id=agent.store.connectionId,{open,lead}=await this.access(id,phone,operator);if(lead.cadenceReviewRequired&&template.consentConfirmed!==true)throw fail('Confirme a autorização do cliente para esta retomada.',409);
  if(open)throw fail('Cliente respondeu antes do envio. A janela está aberta; use uma mensagem normal.',409);
  if(template.consentConfirmed!==true&&!template.automatic)throw fail('Autorização de contato ausente.',409);
  const current=await this.template(id,template.name,template.language),filled=fillTemplate(current,template.values||{});
  if(template.fingerprint&&current.fingerprint!==template.fingerprint||filled.text!==template.body)throw fail('O modelo mudou depois da prévia. Confira antes de reenviar.',409);
  const {user}=await this.access(id,phone,operator);
  const result=await agent.whatsapp.sendTemplate(phone,filled.payload,filled.text,{actor:'human',operatorId:user.id,operatorName:user.name||user.email,templateName:current.name,signed:false,automaticTemplate:template.automatic===true});
  const conv=await agent.store.getConversation(phone);conv.pendingHuman??=[];conv.pendingHuman.push({id:'template-'+(result.messages?.[0]?.id||''),text:'Modelo aprovado enviado pelo atendente: '+filled.text,receivedAt:new Date().toISOString()});await agent.store.saveConversation(conv);return filled.text;
 }
}

export function chooseAutomaticTemplate(templates,settings,text){
 const normalize=t=>String(t||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 const wanted=normalize(text),keys=new Set([settings.template_name,...(settings.template_sequence||[]).map(t=>t.name)]);
 const eligible=templates.filter(t=>t.supported&&!t.fields.length&&!t.header&&!t.buttons.length&&t.category==='MARKETING');
 const exact=eligible.find(t=>normalize(t.body)===wanted);if(exact)return exact;
 const candidates=eligible.filter(t=>keys.has(t.name)&&!/(encerrar|encerramos|despedida|ultima tentativa|por enquanto)/.test(normalize(t.body)));
 const topics=[/duvida|entender|explicar/,/apresenta|demonstra|conhecer/,/necessidade|precisa|resolver/,/rotina|tempo|simplificar/];
 return candidates.map((t,index)=>({t,index,score:topics.reduce((n,re)=>n+(re.test(wanted)&&re.test(normalize(t.body))?1:0),0)})).sort((a,b)=>b.score-a.score||a.index-b.index)[0]?.t;
}
