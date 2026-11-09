import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {SalesAgent} from './agent.js';
import {DurableInbox} from './inbox.js';
import {WhatsAppClient,extractMessages,extractStatuses,verifySignature} from './whatsapp.js';
import {encryptSecret,decryptSecret} from './secrets.js';
import {PROVIDERS,providerSettings} from './llm.js';

export class ConnectionRegistry{
 constructor(store,config,{fetchImpl=fetch,agenda,crm,cadence,media}={}){this.store=store;this.config=config;this.fetch=fetchImpl;this.agenda=agenda;this.crm=crm;this.cadence=cadence;this.media=media;this.runtimes=new Map();this.creating=new Map();}
 async init(){
  const c=await this.store.getConnection('default');
  if(!c.context_id){const settings=await this.store.getSettings();const body=await fs.readFile(this.config.scriptFile,'utf8')+(settings.context?'\n\n'+settings.context:'');const context=await this.store.saveContext('default','Comercial Command',body);await this.store.pool.query('UPDATE whatsapp_connections SET phone_number_id=$1,display_phone=$2,app_id=$3,waba_id=$4,context_id=$5,provider=$6 WHERE id=\'default\'',[this.config.phoneNumberId,'+55 85 93618-1071',this.config.appId,this.config.wabaId,context.id,settings.aiProvider||this.config.aiProvider]);}
  for(const c of await this.list())await this.runtime(c.id);
 }
 async list(){const {rows}=await this.store.pool.query(`SELECT c.id,c.name,c.phone_number_id AS "phoneNumberId",c.display_phone AS "displayPhone",c.app_id AS "appId",c.waba_id AS "wabaId",c.context_id AS "contextId",c.provider,c.enabled,c.updated_at,p.name AS "contextName",p.version AS "contextVersion",(c.access_token_cipher IS NOT NULL) AS "customToken",(c.app_secret_cipher IS NOT NULL) AS "customSecret" FROM whatsapp_connections c LEFT JOIN context_profiles p ON p.id=c.context_id ORDER BY c.id='default' DESC,c.name`);return rows;}
 async configFor(id){const c=await this.store.getConnection(id);return {...this.config,connectionId:id,connectionName:c.name,enabled:c.enabled,phoneNumberId:c.phone_number_id,appId:c.app_id||this.config.appId,wabaId:c.waba_id||this.config.wabaId,accessToken:c.access_token_cipher?decryptSecret(c.access_token_cipher,this.config.connectionsKey):this.config.accessToken,appSecret:c.app_secret_cipher?decryptSecret(c.app_secret_cipher,this.config.connectionsKey):this.config.appSecret,sellerNumbers:c.seller_numbers?c.seller_numbers.split(',').filter(Boolean):id==='default'?this.config.sellerNumbers:[]};}
 runtime(id){if(this.runtimes.has(id))return Promise.resolve(this.runtimes.get(id));if(this.creating.has(id))return this.creating.get(id);const promise=this.buildRuntime(id);this.creating.set(id,promise);promise.then(()=>this.creating.delete(id),()=>this.creating.delete(id));return promise;}
 async buildRuntime(id){
  if(this.runtimes.has(id))return this.runtimes.get(id);
  await this.store.getConnection(id);
  const scoped=this.store.scope(id);
  const whatsapp={sendText:async(to,text,meta={})=>{const c=await this.configFor(id);if(!c.enabled)throw new Error('Conexão pausada. Nenhuma mensagem enviada.');return new WhatsAppClient(c,this.fetch,scoped).sendText(to,text,meta);},sendMedia:async(to,kind,media,text,meta)=>{const c=await this.configFor(id);if(!c.enabled)throw new Error('Conexão pausada.');return new WhatsAppClient(c,this.fetch,scoped).sendMedia(to,kind,media,text,meta);},sendTemplate:async(to,template,text,meta)=>{const c=await this.configFor(id);if(!c.enabled)throw new Error('Conexão pausada.');return new WhatsAppClient(c,this.fetch,scoped).sendTemplate(to,template,text,meta);},markRead:async(messageId)=>new WhatsAppClient(await this.configFor(id),this.fetch,scoped).markRead(messageId)};
  const sales=new SalesAgent({config:await this.configFor(id),store:scoped,whatsapp,agenda:this.agenda,crm:this.crm,cadence:this.cadence,media:this.media});
  const agent={enqueue:async message=>{const c=await this.configFor(id);if(!c.enabled&&!message.manual&&!message.followup){if(message.media&&this.media){const a=await this.media.receive(id,message.from,message.id,message.media);await scoped.recordEvent({id:message.id,phone:message.from,direction:'in',actor:'client',text:a.transcript||message.text,type:message.type,attachment:this.media.public(a)});await scoped.updateLead(message.from,{nomeWhatsApp:message.name});return null;}await scoped.recordEvent({id:message.id,phone:message.from,direction:'in',actor:'client',text:message.text});await scoped.updateLead(message.from,{nomeWhatsApp:message.name});return null;}return sales.enqueue(message);}};
  const inbox=new DurableInbox({store:scoped,agent});await inbox.init();
  const runtime={store:scoped,agent:sales,inbox};this.runtimes.set(id,runtime);
  if(!this.config.panelOnly)inbox.resume();return runtime;
 }
 async receive(payload,raw,signature){
  const matches=(await this.list()).filter(c=>(payload.entry||[]).some(e=>(e.changes||[]).some(change=>change.value?.metadata?.phone_number_id===c.phoneNumberId)));
  if(!matches.length){for(const c of await this.list()){if(verifySignature(raw,signature,(await this.configFor(c.id)).appSecret))return;}throw Object.assign(new Error('invalid signature'),{status:401});}
  for(const c of matches){if(!verifySignature(raw,signature,(await this.configFor(c.id)).appSecret))throw Object.assign(new Error('invalid signature'),{status:401});}
  for(const c of matches){const runtime=await this.runtime(c.id);for(const status of extractStatuses(payload,c.phoneNumberId))await runtime.store.recordDelivery(status);for(const message of extractMessages(payload,c.phoneNumberId))await runtime.inbox.accept({...message,connectionId:c.id});}
 }
 async save(body){
  const id=body.id||crypto.randomUUID();
  if(typeof body.name!=='string'||!body.name.trim()||body.name.length>100||!/^\d{5,30}$/.test(body.phoneNumberId||'')||!PROVIDERS.includes(body.provider)||typeof body.contextId!=='string')throw Object.assign(new Error('Preencha nome, ID do número, contexto e provedor válidos.'),{status:400});
  if(!(await this.store.listContexts()).some(c=>c.id===body.contextId))throw Object.assign(new Error('Contexto não encontrado.'),{status:400});
  const existing=(await this.list()).find(c=>c.id===id);
  if(existing&&existing.phoneNumberId!==body.phoneNumberId)throw Object.assign(new Error('Para outro número, cadastre outra conexão. O histórico deste número será preservado.'),{status:409});
  for(const key of ['displayPhone','appId','wabaId','accessToken','appSecret'])if(body[key]!==undefined&&(typeof body[key]!=='string'||body[key].length>4096))throw Object.assign(new Error('Campo de conexão inválido.'),{status:400});
  for(const key of ['appId','wabaId'])if(body[key]&&!/^\d{5,30}$/.test(body[key]))throw Object.assign(new Error('Os identificadores da Meta devem conter somente números.'),{status:400});
  if(body.appSecret&&!/^[a-f0-9]{32}$/i.test(body.appSecret))throw Object.assign(new Error('Chave secreta da Meta inválida.'),{status:400});
  const token=body.accessToken?encryptSecret(body.accessToken.trim(),this.config.connectionsKey):null;
  const secret=body.appSecret?encryptSecret(body.appSecret.trim(),this.config.connectionsKey):null;
  try{await this.store.pool.query(`INSERT INTO whatsapp_connections(id,name,phone_number_id,display_phone,app_id,waba_id,context_id,provider,enabled,access_token_cipher,app_secret_cipher) VALUES($1,$2,$3,$4,$5,$6,$7,$8,false,$9,$10) ON CONFLICT(id) DO UPDATE SET name=excluded.name,display_phone=excluded.display_phone,app_id=excluded.app_id,waba_id=excluded.waba_id,context_id=excluded.context_id,provider=excluded.provider,enabled=CASE WHEN $11 THEN false ELSE whatsapp_connections.enabled END,access_token_cipher=COALESCE(excluded.access_token_cipher,whatsapp_connections.access_token_cipher),app_secret_cipher=COALESCE(excluded.app_secret_cipher,whatsapp_connections.app_secret_cipher),updated_at=now()`,[id,body.name.trim(),body.phoneNumberId,body.displayPhone||'',body.appId||this.config.appId,body.wabaId||this.config.wabaId,body.contextId,body.provider,token,secret,body.enabled===false||!!token||!!secret||!!(existing&&(existing.appId!==(body.appId||this.config.appId)||existing.wabaId!==(body.wabaId||this.config.wabaId)))]);}catch(e){if(e.code==='23505')throw Object.assign(new Error('Este ID de número já possui uma conexão cadastrada.'),{status:409});throw e;}
  return (await this.list()).find(c=>c.id===id);
 }
 async activate(id){
  const c=await this.configFor(id),base='https://graph.facebook.com/'+c.graphVersion;
  const call=async(path,token,body)=>{const r=await this.fetch(base+'/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},...(body?{body:new URLSearchParams(body)}:{}),signal:AbortSignal.timeout(30000)});const result=await r.json();if(!r.ok)throw Object.assign(new Error('A Meta não validou a conexão. Confira IDs, permissões e credenciais (código '+(result.error?.code||r.status)+').'),{status:400});return result;};
  if(!providerSettings((await this.store.getConnection(id)).provider).ready)throw Object.assign(new Error('Configure a chave e o modelo da IA escolhida no servidor antes de ativar.'),{status:400});
  const phone=await call(c.phoneNumberId+'?fields=id,display_phone_number,status,platform_type,code_verification_status',c.accessToken);
  if(phone.status&&phone.status!=='CONNECTED'||phone.platform_type&&phone.platform_type!=='CLOUD_API')throw Object.assign(new Error('O número ainda precisa ser registrado/conectado à Cloud API na Meta.'),{status:400});
  await call(c.appId+'?fields=id',c.appId+'|'+c.appSecret);
  const subscriptions=await call(c.appId+'/subscriptions',c.appId+'|'+c.appSecret);
  if(subscriptions.data?.some(s=>s.object==='whatsapp_business_account'&&s.active&&s.callback_url!==this.config.publicUrl+'/webhook'))throw Object.assign(new Error('Este aplicativo já tem outro webhook ativo. Use um aplicativo dedicado para não interromper a integração existente.'),{status:409});
  await call(c.appId+'/subscriptions',c.appId+'|'+c.appSecret,{object:'whatsapp_business_account',callback_url:this.config.publicUrl+'/webhook',verify_token:c.verifyToken,fields:'messages',include_values:'true'});
  await call(c.wabaId+'/subscribed_apps',c.accessToken,{});
  await this.store.pool.query('UPDATE whatsapp_connections SET enabled=true,display_phone=$2,updated_at=now() WHERE id=$1',[id,phone.display_phone_number||'']);return (await this.list()).find(c=>c.id===id);
 }
 async drain(){await Promise.all([...this.runtimes.values()].map(r=>r.inbox.drain()));}
}
