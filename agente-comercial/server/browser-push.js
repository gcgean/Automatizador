import {businessOpen,defaultHours} from './consultant-routing.js';
import {canSeeLead} from './conversation-access.js';
import crypto from 'node:crypto';
import {generateVAPIDKeys,sendNotification} from 'web-push';
import {encryptSecret,decryptSecret} from './secrets.js';
import {can} from '../shared/access.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status}),digest=s=>crypto.createHash('sha256').update(s).digest('hex');
export function validateSubscription(value){
 let url;try{url=new URL(value?.endpoint);}catch{}const host=url?.hostname,allowed=host==='fcm.googleapis.com'||host==='updates.push.services.mozilla.com'||host==='push.services.mozilla.com'||host==='web.push.apple.com'||host?.endsWith('.notify.windows.com');
 if(!url||url.protocol!=='https:'||url.username||url.password||url.port&&url.port!=='443'||!allowed||value.endpoint.length>4096)throw fail('Endereço de serviço push não reconhecido.');
 for(const [key,length]of [['p256dh',65],['auth',16]])if(typeof value.keys?.[key]!=='string'||!/^[-_A-Za-z0-9]+={0,2}$/.test(value.keys[key])||Buffer.from(value.keys[key],'base64url').length!==length)throw fail('Chaves de notificação inválidas.');
 return {endpoint:value.endpoint,keys:{p256dh:value.keys.p256dh,auth:value.keys.auth}};
}
export class BrowserPush{
 constructor(store,config,auth,{send=sendNotification}={}){this.store=store;this.config=config;this.auth=auth;this.send=send;}
 async keys(){let row=(await this.store.pool.query('SELECT * FROM browser_push_keys WHERE id=1')).rows[0];if(!row){const k=generateVAPIDKeys();await this.store.pool.query('INSERT INTO browser_push_keys(id,public_key,private_key_cipher) VALUES(1,$1,$2) ON CONFLICT DO NOTHING',[k.publicKey,encryptSecret(k.privateKey,this.config.connectionsKey)]);row=(await this.store.pool.query('SELECT * FROM browser_push_keys WHERE id=1')).rows[0];}return {publicKey:row.public_key,privateKey:decryptSecret(row.private_key_cipher,this.config.connectionsKey)};}
 async status(user,endpoint,session=null){if(endpoint!==undefined&&(typeof endpoint!=='string'||endpoint.length>4096))throw fail('Dispositivo inválido.');const keys=await this.keys();const row=endpoint?(await this.store.pool.query('SELECT 1 FROM browser_push_subscriptions WHERE endpoint_hash=$1 AND user_id=$2 AND company_id=$3',[digest(endpoint),user.id,user.company_id])).rowCount:0;if(row&&session)await this.store.pool.query('UPDATE browser_push_subscriptions SET session_hash=$4,updated_at=now() WHERE endpoint_hash=$1 AND user_id=$2 AND company_id=$3',[digest(endpoint),user.id,user.company_id,digest(session)]);return {publicKey:keys.publicKey,enabled:!!row};}
 async subscribe(user,body,session){if(!session)throw fail('Entre novamente para ativar as notificações.',401);const sub=validateSubscription(body);await this.store.pool.query('INSERT INTO browser_push_subscriptions(endpoint_hash,user_id,company_id,session_hash,subscription_cipher) VALUES($1,$2,$3,$4,$5) ON CONFLICT(endpoint_hash) DO UPDATE SET user_id=excluded.user_id,company_id=excluded.company_id,session_hash=excluded.session_hash,subscription_cipher=excluded.subscription_cipher,updated_at=now()',[digest(sub.endpoint),user.id,user.company_id,digest(session),encryptSecret(JSON.stringify(sub),this.config.connectionsKey)]);return {enabled:true};}
 async unsubscribe(user,endpoint){if(typeof endpoint!=='string'||endpoint.length>4096)throw fail('Dispositivo inválido.');await this.store.pool.query('DELETE FROM browser_push_subscriptions WHERE endpoint_hash=$1 AND user_id=$2 AND company_id=$3',[digest(endpoint),user.id,user.company_id]);return {enabled:false};}
 async newLead(connectionId,phone){
  const connection=await this.store.getConnection(connectionId);
  const users=(await this.store.pool.query('SELECT id FROM users WHERE active AND company_id=$1',[connection.company_id])).rows;
  const recipients=[];
  for(const row of users){const user=await this.auth.identity(row.id);if(user&&can(user,'conversations.view')&&(user.role==='admin'||user.connections.includes(connectionId)))recipients.push(user.id);}
  const scoped=this.store.scope(connectionId);
  await scoped.transaction(async tx=>{
   await tx.pool.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[connectionId+':'+phone]);
   if(await tx.getLead(phone))return;
   await tx.updateLead(phone,{});
   for(const userId of recipients)await tx.pool.query("INSERT INTO user_notifications(id,user_id,company_id,connection_id,phone,kind) VALUES($1,$2,$3,$4,$5,'new_lead')",[crypto.randomUUID(),userId,connection.company_id,connectionId,phone]);
  });
 }
 tick(){if(this.running)return this.running;this.running=this.process().finally(()=>{this.running=null;});return this.running;}
 async process(){
  const {rows}=await this.store.pool.query("SELECT n.kind,n.id,n.user_id,n.company_id,n.connection_id,n.phone,p.endpoint_hash,p.subscription_cipher FROM user_notifications n JOIN browser_push_subscriptions p ON p.user_id=n.user_id AND p.company_id=n.company_id JOIN users u ON u.id=n.user_id JOIN companies e ON e.id=n.company_id JOIN sessions s ON s.token_hash=p.session_hash AND s.user_id=u.id WHERE n.read_at IS NULL AND n.created_at>now()-interval '1 day' AND u.active AND e.active AND s.expires_at>now() AND COALESCE(s.company_id,u.company_id)=n.company_id AND NOT EXISTS(SELECT 1 FROM browser_push_deliveries d WHERE d.notification_id=n.id AND d.endpoint_hash=p.endpoint_hash) ORDER BY n.created_at LIMIT 50");
  if(!rows.length)return;const keys=await this.keys();
  for(const n of rows){if(n.kind==='waiting_reply'){const h=(await this.store.pool.query('SELECT data FROM company_handoff_settings WHERE company_id=$1',[n.company_id])).rows[0]?.data||defaultHours();if(!businessOpen({...h,enabled:true}))continue;}const user=await this.auth.identity(n.user_id),lead=await this.store.scope(n.connection_id).getLead(n.phone);if(!user||!canSeeLead(user,lead)||!can(user,'conversations.view')||user.role!=='admin'&&!user.connections.includes(n.connection_id)||(n.kind==='new_lead'?(lead?.assignedUserId&&lead.assignedUserId!==user.id&&user.role!=='admin'):lead?.assignedUserId!==user.id))continue;
   const claim=await this.store.pool.query("INSERT INTO browser_push_deliveries(notification_id,endpoint_hash,status) VALUES($1,$2,'sending') ON CONFLICT DO NOTHING RETURNING status",[n.id,n.endpoint_hash]);if(!claim.rowCount)continue;
   try{const sub=JSON.parse(decryptSecret(n.subscription_cipher,this.config.connectionsKey));await this.send(sub,JSON.stringify({title:n.kind==='waiting_reply'?'Cliente aguardando sua resposta há 15 minutos':n.kind==='new_lead'?'Novo lead falando na plataforma com a HELENA':'Novo lead vinculado a você',body:n.kind==='waiting_reply'?'Confira o atendimento. Após 30 minutos, o apoio automático pode responder.':'Abra a plataforma para ver o novo atendimento.',notificationId:n.id}),{TTL:1800,urgency:'high',timeout:10000,vapidDetails:{subject:new URL(this.config.publicUrl).origin,...keys}});await this.store.pool.query("UPDATE browser_push_deliveries SET status='accepted',updated_at=now() WHERE notification_id=$1 AND endpoint_hash=$2",[n.id,n.endpoint_hash]);}
   catch(error){const status=Number(error.statusCode)||0;await this.store.pool.query("UPDATE browser_push_deliveries SET status='failed',detail=$3,updated_at=now() WHERE notification_id=$1 AND endpoint_hash=$2",[n.id,n.endpoint_hash,status?'HTTP '+status:'Entrega não confirmada']);if([404,410].includes(status))await this.store.pool.query('DELETE FROM browser_push_subscriptions WHERE endpoint_hash=$1',[n.endpoint_hash]);}
  }
 }
}
