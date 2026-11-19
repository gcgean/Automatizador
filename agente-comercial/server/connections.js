import {receiveBusinessApp,coexistenceFields} from './coexistence.js';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import {SalesAgent} from './agent.js';
import {DurableInbox} from './inbox.js';
import {WhatsAppClient,extractMessages,extractStatuses,verifySignature} from './whatsapp.js';
import {InstagramClient,extractInstagram,instagramAccounts,storeInstagramMedia,igBase} from './instagram.js';
import {YouTubeClient} from './youtube.js';
import {encryptSecret,decryptSecret} from './secrets.js';
import {PROVIDERS,providerSettings} from './llm.js';

export class ConnectionRegistry{
 constructor(store,config,{fetchImpl=fetch,agenda,crm,cadence,reminders,media,calling}={}){this.store=store;this.config=config;this.fetch=fetchImpl;this.agenda=agenda;this.crm=crm;this.cadence=cadence;this.reminders=reminders;this.media=media;this.calling=calling;this.runtimes=new Map();this.creating=new Map();}
 async init(){
  const c=await this.store.getConnection('default');
  if(!c.context_id){const settings=await this.store.getSettings();const body=await fs.readFile(this.config.scriptFile,'utf8')+(settings.context?'\n\n'+settings.context:'');const context=await this.store.saveContext('default','Comercial Command',body);await this.store.pool.query('UPDATE whatsapp_connections SET phone_number_id=$1,display_phone=$2,app_id=$3,waba_id=$4,context_id=$5,provider=$6 WHERE id=\'default\'',[this.config.phoneNumberId,'+55 85 93618-1071',this.config.appId,this.config.wabaId,context.id,settings.aiProvider||this.config.aiProvider]);}
  for(const c of await this.list())await this.runtime(c.id);
 }
 async list(){const {rows}=await this.store.pool.query(`SELECT c.id,c.channel,c.coexistence,c.name,c.color,c.company_id AS "companyId",c.phone_number_id AS "phoneNumberId",c.display_phone AS "displayPhone",c.app_id AS "appId",c.waba_id AS "wabaId",c.context_id AS "contextId",c.provider,(c.enabled AND e.active) AS enabled,c.webhook_mode AS "webhookMode",c.updated_at,p.name AS "contextName",p.version AS "contextVersion",(c.access_token_cipher IS NOT NULL) AS "customToken",(c.app_secret_cipher IS NOT NULL) AS "customSecret",y.whatsapp_link AS "youtubeLink",y.auto_reply AS "youtubeAuto",y.last_error AS "youtubeError",y.last_poll_at AS "youtubeLastPoll" FROM whatsapp_connections c JOIN companies e ON e.id=c.company_id LEFT JOIN context_profiles p ON p.id=c.context_id LEFT JOIN youtube_channels y ON y.connection_id=c.id ORDER BY c.id='default' DESC,c.name`);return rows;}
 async configFor(id){const c=await this.store.getConnection(id);return {...this.config,connectionId:id,channel:c.channel||'whatsapp',coexistence:c.coexistence,connectionName:c.name,webhookMode:c.webhook_mode,enabled:c.enabled&&c.company_active!==false,phoneNumberId:c.phone_number_id,appId:c.app_id||(c.company_id==='default'?this.config.appId:''),wabaId:c.waba_id||(c.company_id==='default'?this.config.wabaId:''),accessToken:c.access_token_cipher?decryptSecret(c.access_token_cipher,this.config.connectionsKey):c.company_id==='default'?this.config.accessToken:'',appSecret:c.app_secret_cipher?decryptSecret(c.app_secret_cipher,this.config.connectionsKey):c.company_id==='default'?this.config.appSecret:'',sellerNumbers:c.seller_numbers?c.seller_numbers.split(',').filter(Boolean):id==='default'?this.config.sellerNumbers:[]};}
 // Cada canal tem seu cliente de envio; a interface é a mesma (sendText, sendInteractive, sendMedia...).
 client(c,scoped){return c.channel==='instagram'?new InstagramClient(c,this.fetch,scoped):c.channel==='youtube'?new YouTubeClient(c,this.fetch,scoped,this.youtube?.tokens):new WhatsAppClient(c,this.fetch,scoped);}
 runtime(id){if(this.runtimes.has(id))return Promise.resolve(this.runtimes.get(id));if(this.creating.has(id))return this.creating.get(id);const promise=this.buildRuntime(id);this.creating.set(id,promise);promise.then(()=>this.creating.delete(id),()=>this.creating.delete(id));return promise;}
 async buildRuntime(id){
  if(this.runtimes.has(id))return this.runtimes.get(id);
  await this.store.getConnection(id);
  const scoped=this.store.scope(id);
  const whatsapp={sendInteractive:async(to,text,interactive,meta={})=>{const c=await this.configFor(id);if(!c.enabled)throw new Error('Conexão pausada. Nenhuma mensagem enviada.');return this.client(c,scoped).sendInteractive(to,text,interactive,meta);},sendText:async(to,text,meta={})=>{const c=await this.configFor(id);if(!c.enabled)throw new Error('Conexão pausada. Nenhuma mensagem enviada.');return this.client(c,scoped).sendText(to,text,meta);},sendMedia:async(to,kind,media,text,meta)=>{const c=await this.configFor(id);if(!c.enabled)throw new Error('Conexão pausada.');return this.client(c,scoped).sendMedia(to,kind,media,text,meta);},sendTemplate:async(to,template,text,meta)=>{const c=await this.configFor(id);if(!c.enabled)throw new Error('Conexão pausada.');return this.client(c,scoped).sendTemplate(to,template,text,meta);},markRead:async(messageId)=>this.client(await this.configFor(id),scoped).markRead(messageId)};
  const sales=new SalesAgent({config:await this.configFor(id),store:scoped,whatsapp,agenda:this.agenda,crm:this.crm,cadence:this.cadence,reminders:this.reminders,reengagement:this.reengagement,routing:this.routing,pipeline:this.pipeline,media:this.media});
  const agent={enqueue:async message=>{const c=await this.configFor(id);
   // YouTube: a IA de vendas não conversa nos comentários; o comentário entra no atendimento e a resposta é aprovada pela equipe.
   if(c.channel==='youtube'){await scoped.recordEvent({id:message.id,phone:message.from,direction:'in',actor:'client',text:message.text,channel:'youtube',youtube:message.youtube});await scoped.updateLead(message.from,{nomeWhatsApp:message.name,youtubeHandle:message.youtube?.handle||undefined,status:'encaminhado'});await this.youtube?.afterInbound(id,message);return null;}
   if(!c.enabled&&!message.manual&&!message.followup){if(message.media&&this.media){const a=await this.media.receive(id,message.from,message.id,message.media);await scoped.recordEvent({id:message.id,phone:message.from,direction:'in',actor:'client',text:a.transcript||message.text,type:message.type,attachment:this.media.public(a)});await scoped.updateLead(message.from,{nomeWhatsApp:message.name});return null;}await scoped.recordEvent({id:message.id,phone:message.from,direction:'in',actor:'client',text:message.text});await scoped.updateLead(message.from,{nomeWhatsApp:message.name});return null;}return sales.enqueue(message);}};
  const inbox=new DurableInbox({store:scoped,agent,beforeInbound:async message=>{await this.push?.newLead(id,message.from);await this.agenda?.suppressRemindersFromMessage?.(id,message.from,message.text,message.id);}});await inbox.init();
  const runtime={store:scoped,agent:sales,inbox};this.runtimes.set(id,runtime);
  if(!this.config.panelOnly)inbox.resume();return runtime;
 }
 async receive(payload,raw,signature){
  if(payload?.object==='instagram')return this.receiveInstagram(payload,raw,signature);
  const matches=(await this.list()).filter(c=>(payload.entry||[]).some(e=>(e.changes||[]).some(change=>change.value?.metadata?.phone_number_id===c.phoneNumberId)));
  if(!matches.length){for(const c of await this.list()){if(verifySignature(raw,signature,(await this.configFor(c.id)).appSecret))return;}throw Object.assign(new Error('invalid signature'),{status:401});}
  for(const c of matches){if(!verifySignature(raw,signature,(await this.configFor(c.id)).appSecret))throw Object.assign(new Error('invalid signature'),{status:401});}
  for(const c of matches){const runtime=await this.runtime(c.id);if(c.coexistence)await receiveBusinessApp(runtime.store,payload,c.phoneNumberId,this.media);if(this.calling)await this.calling.receive(c.id,payload,c.phoneNumberId);for(const status of extractStatuses(payload,c.phoneNumberId))await runtime.store.recordDelivery(status);for(const message of extractMessages(payload,c.phoneNumberId)){if(this.meta)await this.meta.capture(c.id,message);await runtime.inbox.accept({...message,connectionId:c.id});}}
 }
 // Webhook do Instagram (object=instagram): mesma assinatura do app, contas pelo ID do Instagram.
 async receiveInstagram(payload,raw,signature){
  const ids=instagramAccounts(payload),matches=(await this.list()).filter(c=>c.channel==='instagram'&&ids.includes(String(c.phoneNumberId)));
  if(!matches.length){for(const c of await this.list()){if(verifySignature(raw,signature,(await this.configFor(c.id)).appSecret))return;}throw Object.assign(new Error('invalid signature'),{status:401});}
  for(const c of matches){if(!verifySignature(raw,signature,(await this.configFor(c.id)).appSecret))throw Object.assign(new Error('invalid signature'),{status:401});}
  for(const c of matches){const runtime=await this.runtime(c.id),config=await this.configFor(c.id),client=new InstagramClient(config,this.fetch,runtime.store);
   for(const message of extractInstagram(payload,c.phoneNumberId)){
    const lead=await runtime.store.getLead(message.from);
    if(!lead?.instagramUsername){const profile=await client.profile(message.from).catch(()=>null);if(profile&&(profile.name||profile.username))await runtime.store.updateLead(message.from,{nomeWhatsApp:profile.name||profile.username,instagramUsername:profile.username||false});message.name=profile?.name||profile?.username||'';}
    if(message.media)try{await storeInstagramMedia(message.media,{fetchImpl:this.fetch,pool:this.store.pool,connectionId:c.id,phone:message.from,messageId:message.id,mediaService:this.media});}catch{}
    await runtime.inbox.accept({...message,connectionId:c.id});
   }
  }
 }
 async save(body,companyId='default',coexistence=false){
  const id=body.id||crypto.randomUUID();
  // YouTube: o ID do canal vem do Google ao conectar; até lá a conexão guarda um identificador provisório.
  const prior=body.id?(await this.list()).find(c=>c.id===body.id):null;
  if((body.channel??prior?.channel)==='youtube'){body={...body,channel:'youtube',phoneNumberId:prior?.phoneNumberId||'youtube-'+id,appId:String(body.appId||'').trim(),accessToken:'',wabaId:''};this.youtube?.checkLink(body.youtubeLink);}
  if(typeof body.name!=='string'||!body.name.trim()||body.name.length>100||!(/^\d{5,30}$/.test(body.phoneNumberId||'')||body.channel==='youtube')||!PROVIDERS.includes(body.provider)||typeof body.contextId!=='string')throw Object.assign(new Error('Preencha nome, ID do número, contexto e provedor válidos.'),{status:400});
  if(!(await this.store.listContexts(companyId)).some(c=>c.id===body.contextId))throw Object.assign(new Error('Contexto não encontrado.'),{status:400});
  const existing=(await this.list()).find(c=>c.id===id),channel=body.channel??existing?.channel??'whatsapp';
  if(!['whatsapp','instagram','youtube'].includes(channel))throw Object.assign(new Error('Canal inválido.'),{status:400});
  if(existing&&existing.channel!==channel)throw Object.assign(new Error('O canal de uma conexão não pode ser trocado. Cadastre outra conexão.'),{status:409});
  if(existing&&existing.companyId!==companyId)throw Object.assign(new Error('Conexão não encontrada nesta empresa.'),{status:404});
  if(companyId!=='default'&&(!body.appId||channel==='whatsapp'&&!body.wabaId||channel!=='youtube'&&!body.accessToken&&!existing?.customToken||!body.appSecret&&!existing?.customSecret))throw Object.assign(new Error('Cadastre os IDs e as credenciais Meta desta empresa.'),{status:400});
  if(body.color!==undefined&&body.color!==null&&!/^#[0-9a-f]{6}$/i.test(body.color))throw Object.assign(new Error('Escolha uma cor válida para a conexão.'),{status:400});
  const color=body.color??existing?.color??null;
  const webhookMode=body.webhookMode??existing?.webhookMode??'app';
  if(!['app','waba_override'].includes(webhookMode))throw Object.assign(new Error('Modo de webhook inválido.'),{status:400});
  if(existing&&existing.phoneNumberId!==body.phoneNumberId)throw Object.assign(new Error('Para outro número, cadastre outra conexão. O histórico deste número será preservado.'),{status:409});
  for(const key of ['displayPhone','appId','wabaId','accessToken','appSecret'])if(body[key]!==undefined&&(typeof body[key]!=='string'||body[key].length>4096))throw Object.assign(new Error('Campo de conexão inválido.'),{status:400});
  if(channel==='youtube'){if(body.appId&&!/^[\w.-]{6,200}\.apps\.googleusercontent\.com$/.test(body.appId))throw Object.assign(new Error('ID do cliente Google inválido. Ele termina em .apps.googleusercontent.com.'),{status:400});if(body.appSecret&&!/^[\w-]{10,100}$/.test(body.appSecret.trim()))throw Object.assign(new Error('Chave secreta do cliente Google inválida.'),{status:400});}
  for(const key of ['appId','wabaId'])if(channel!=='youtube'&&body[key]&&!/^\d{5,30}$/.test(body[key]))throw Object.assign(new Error('Os identificadores da Meta devem conter somente números.'),{status:400});
  if(channel!=='youtube'&&body.appSecret&&!/^[a-f0-9]{32}$/i.test(body.appSecret.trim()))throw Object.assign(new Error('Chave secreta da Meta inválida.'),{status:400});
  const token=body.accessToken?encryptSecret(body.accessToken.trim(),this.config.connectionsKey):null;
  const secret=body.appSecret?encryptSecret(body.appSecret.trim(),this.config.connectionsKey):null;
  try{await this.store.pool.query(`INSERT INTO whatsapp_connections(id,name,phone_number_id,display_phone,app_id,waba_id,context_id,provider,enabled,access_token_cipher,app_secret_cipher,webhook_mode,color,company_id,coexistence,channel) VALUES($1,$2,$3,$4,$5,$6,$7,$8,false,$9,$10,$12,$13,$14,$15,$16) ON CONFLICT(id) DO UPDATE SET name=excluded.name,color=excluded.color,webhook_mode=excluded.webhook_mode,display_phone=excluded.display_phone,app_id=excluded.app_id,waba_id=excluded.waba_id,context_id=excluded.context_id,provider=excluded.provider,enabled=CASE WHEN $11 THEN false ELSE whatsapp_connections.enabled END,access_token_cipher=COALESCE(excluded.access_token_cipher,whatsapp_connections.access_token_cipher),app_secret_cipher=COALESCE(excluded.app_secret_cipher,whatsapp_connections.app_secret_cipher),updated_at=now()`,[id,body.name.trim(),body.phoneNumberId,body.displayPhone||'',body.appId||(companyId==='default'?this.config.appId:''),body.wabaId||(companyId==='default'?this.config.wabaId:''),body.contextId,body.provider,token,secret,body.enabled===false||!!(existing&&existing.webhookMode!==webhookMode)||!!token||!!secret||!!(existing&&(existing.appId!==(body.appId||this.config.appId)||existing.wabaId!==(body.wabaId||this.config.wabaId))),webhookMode,color,companyId,channel==='instagram'?false:coexistence,channel]);}catch(e){if(e.code==='23505')throw Object.assign(new Error('Este ID de número já possui uma conexão cadastrada.'),{status:409});throw e;}
  if(channel==='youtube')await this.youtube?.saveSettings(id,{whatsappLink:body.youtubeLink,autoReply:body.youtubeAuto});
  return (await this.list()).find(c=>c.id===id);
 }
 async activate(id){
  if((await this.store.getConnection(id)).channel==='instagram')return this.activateInstagram(id);
  if((await this.store.getConnection(id)).channel==='youtube')throw Object.assign(new Error('No YouTube a ativação é pelo botão "Conectar com o Google".'),{status:400});
  const c=await this.configFor(id),base='https://graph.facebook.com/'+c.graphVersion;
  const call=async(path,token,body)=>{const r=await this.fetch(base+'/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},...(body?{body:new URLSearchParams(body)}:{}),signal:AbortSignal.timeout(30000)});const result=await r.json();if(!r.ok)throw Object.assign(new Error('A Meta não validou a conexão. Confira IDs, permissões e credenciais (código '+(result.error?.code||r.status)+').'),{status:400});return result;};
  if(!providerSettings((await this.store.getConnection(id)).provider).ready)throw Object.assign(new Error('Configure a chave e o modelo da IA escolhida no servidor antes de ativar.'),{status:400});
  const phone=await call(c.phoneNumberId+'?fields=id,display_phone_number,status,platform_type,code_verification_status',c.accessToken);
  if(phone.status&&phone.status!=='CONNECTED'||phone.platform_type&&phone.platform_type!=='CLOUD_API')throw Object.assign(new Error('O número ainda precisa ser registrado/conectado à Cloud API na Meta.'),{status:400});
  await call(c.appId+'?fields=id',c.appId+'|'+c.appSecret);
  const subscriptions=await call(c.appId+'/subscriptions',c.appId+'|'+c.appSecret);
  if(c.webhookMode==='waba_override'){
   const subscription=subscriptions.data?.find(s=>s.object==='whatsapp_business_account'&&s.active);
   if(!subscription?.fields?.some(f=>f.name==='messages'))throw Object.assign(new Error('O aplicativo precisa ter a assinatura messages ativa na Meta. O webhook do app foi preservado.'),{status:409});
   if(c.coexistence&&!coexistenceFields.every(name=>subscription.fields.some(f=>f.name===name)))throw Object.assign(new Error('Assine os campos de coexistência no aplicativo Meta.'),{status:409});
   const phones=await call(c.wabaId+'/phone_numbers?fields=id',c.accessToken);
   const registered=await this.list();
   if(!Array.isArray(phones.data)||!phones.data.length||!phones.data.some(p=>p.id===c.phoneNumberId)||phones.paging?.next||!phones.data.every(p=>registered.some(r=>r.phoneNumberId===p.id&&r.appId===c.appId&&r.wabaId===c.wabaId&&r.webhookMode==='waba_override')))
    throw Object.assign(new Error('Esta conta contém números que não estão preparados neste painel. O callback da conta não foi alterado.'),{status:409});
   await call(c.wabaId+'/subscribed_apps',c.accessToken,{override_callback_uri:this.config.publicUrl+'/webhook',verify_token:this.config.verifyToken});
   const apps=await call(c.wabaId+'/subscribed_apps',c.accessToken);
   if(!apps.data?.some(a=>a.whatsapp_business_api_data?.id===c.appId&&a.override_callback_uri===this.config.publicUrl+'/webhook'))throw Object.assign(new Error('A Meta não confirmou o callback específico desta conta. Confira antes de ativar o atendimento.'),{status:409});
  }else{
  if(subscriptions.data?.some(s=>s.object==='whatsapp_business_account'&&s.active&&s.callback_url!==this.config.publicUrl+'/webhook'))throw Object.assign(new Error('Este aplicativo já tem outro webhook ativo. Use um aplicativo dedicado para não interromper a integração existente.'),{status:409});
  await call(c.appId+'/subscriptions',c.appId+'|'+c.appSecret,{object:'whatsapp_business_account',callback_url:this.config.publicUrl+'/webhook',verify_token:c.verifyToken,fields:[...new Set([...(c.coexistence?coexistenceFields:['messages']),...subscriptions.data.filter(s=>s.object==='whatsapp_business_account').flatMap(s=>s.fields?.map(f=>f.name)||[])])].join(','),include_values:'true'});
  await call(c.wabaId+'/subscribed_apps',c.accessToken,{});
  }
  if(c.coexistence){
   for(const sync_type of ['smb_app_state_sync','history']){
    await this.store.transaction(async tx=>{
     const {rows}=await tx.pool.query('SELECT sync_requested FROM whatsapp_connections WHERE id=$1 FOR UPDATE',[id]);
     if(rows[0].sync_requested.includes(sync_type))return;
     await call(c.phoneNumberId+'/smb_app_data',c.accessToken,{messaging_product:'whatsapp',sync_type});
     await tx.pool.query('UPDATE whatsapp_connections SET sync_requested=array_append(sync_requested,$2) WHERE id=$1',[id,sync_type]);
    });
   }
  }
  await this.store.pool.query('UPDATE whatsapp_connections SET enabled=true,display_phone=$2,updated_at=now() WHERE id=$1',[id,phone.display_phone_number||'']);return (await this.list()).find(c=>c.id===id);
 }
 // Ativa a conta do Instagram: confere token e conta, assina o webhook do app (object=instagram)
 // e liga as mensagens da conta para este app.
 async activateInstagram(id){
  const c=await this.configFor(id),fb='https://graph.facebook.com/'+c.graphVersion,ig=igBase(c),igLogin=/^IG/.test(c.accessToken||'');
  const call=async(url,token,body)=>{const r=await this.fetch(url,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/x-www-form-urlencoded'}:{})},...(body?{body:new URLSearchParams(body)}:{}),signal:AbortSignal.timeout(30000)});const result=await r.json().catch(()=>({}));if(!r.ok)throw Object.assign(new Error('A Meta não validou a conta do Instagram. Confira token, permissões e IDs (código '+(result.error?.code||r.status)+').'),{status:400});return result;};
  if(!providerSettings((await this.store.getConnection(id)).provider).ready)throw Object.assign(new Error('Configure a chave e o modelo da IA escolhida no servidor antes de ativar.'),{status:400});
  if(!c.accessToken||!c.appId||!c.appSecret)throw Object.assign(new Error('Cadastre o token do Instagram, o ID do app e a chave secreta do app.'),{status:400});
  let username='';
  if(igLogin){const me=await call(ig+'/me?fields=user_id,username',c.accessToken);if(String(me.user_id||me.id)!==String(c.phoneNumberId))throw Object.assign(new Error('O token é da conta @'+(me.username||'?')+', com outro ID. Confira o ID da conta do Instagram.'),{status:400});username=me.username||'';}
  else{
   // Login do Facebook: webhook e envio passam pela Página ligada à conta. Token de usuário (inclusive de usuário do sistema)
   // é trocado pelo token da Página, que é o aceito em /me/messages e /me/subscribed_apps.
   const nested='instagram_business_account{id,username}',page=await call(fb+'/me?fields=id,'+nested,c.accessToken).catch(()=>null);
   let pageToken=c.accessToken,account=page?.instagram_business_account;
   if(String(account?.id||'')!==String(c.phoneNumberId)){
    const pages=await call(fb+'/me/accounts?limit=100&fields=id,access_token,'+nested,c.accessToken).catch(()=>({data:[]}));
    const match=(pages.data||[]).find(p=>String(p.instagram_business_account?.id||'')===String(c.phoneNumberId));
    if(!match?.access_token)throw Object.assign(new Error('O token não dá acesso à Página do Facebook ligada a esta conta do Instagram. Confira se a Página está atribuída ao usuário do sistema e se o ID da conta do Instagram está certo.'),{status:400});
    pageToken=match.access_token;account=match.instagram_business_account;
   }
   username=account.username||'';
   if(pageToken!==c.accessToken){await this.store.pool.query('UPDATE whatsapp_connections SET access_token_cipher=$2,updated_at=now() WHERE id=$1',[id,encryptSecret(pageToken,this.config.connectionsKey)]);c.accessToken=pageToken;}
  }
  const appToken=c.appId+'|'+c.appSecret,subscriptions=await call(fb+'/'+c.appId+'/subscriptions',appToken),callback=this.config.publicUrl+'/webhook';
  if(subscriptions.data?.some(s=>s.object==='instagram'&&s.active&&s.callback_url!==callback))throw Object.assign(new Error('Este aplicativo já tem outro webhook do Instagram ativo. Use um aplicativo dedicado para não interromper a integração existente.'),{status:409});
  const fields=['messages','messaging_postbacks','message_reactions'];
  await call(fb+'/'+c.appId+'/subscriptions',appToken,{object:'instagram',callback_url:callback,verify_token:this.config.verifyToken,fields:fields.join(','),include_values:'true'});
  await call(ig+'/me/subscribed_apps',c.accessToken,{subscribed_fields:fields.join(',')});
  await this.store.pool.query('UPDATE whatsapp_connections SET enabled=true,display_phone=$2,updated_at=now() WHERE id=$1',[id,username?'@'+username:'']);this.runtimes.delete(id);
  return (await this.list()).find(x=>x.id===id);
 }
 async drain(){await Promise.all([...this.runtimes.values()].map(r=>r.inbox.drain()));}
}
