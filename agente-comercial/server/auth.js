import crypto from 'node:crypto';
import {resolveAccess} from './access.js';
import {promisify} from 'node:util';
const scrypt=promisify(crypto.scrypt);
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const normalizeEmail=value=>String(value||'').trim().toLowerCase();
const passwordValid=value=>typeof value==='string'&&value.length>=8&&value.length<=256;
const COOKIE='command_session';
export async function hashPassword(password){const salt=crypto.randomBytes(16).toString('hex');const key=await scrypt(password,salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});return 'scrypt$'+salt+'$'+key.toString('hex');}
export async function verifyPassword(password,encoded){
 const match=/^scrypt\$([a-f0-9]{32})\$([a-f0-9]{128})$/.exec(encoded||'');
 const salt=match?.[1]||'0'.repeat(32);
 const key=await scrypt(String(password||'').slice(0,256),salt,64,{N:32768,r:8,p:1,maxmem:64*1024*1024});
 return !!match&&crypto.timingSafeEqual(key,Buffer.from(match[2],'hex'));
}
export class PasswordAuth{
 constructor(store,config){this.store=store;this.db=store.pool;this.config=config;this.secure=new URL(config.publicUrl).protocol==='https:';}
 async init(){
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(this.config.adminEmail)||!this.config.adminSetupToken)throw new Error('Configure ADMIN_EMAIL e ADMIN_SETUP_TOKEN para o primeiro acesso.');
  await this.db.query(`INSERT INTO users(id,email,role,setup_hash,setup_expires_at) VALUES($1,$2,'admin',$3,now()+interval '24 hours') ON CONFLICT(email) DO NOTHING`,[crypto.randomUUID(),normalizeEmail(this.config.adminEmail),digest(this.config.adminSetupToken)]);
 }
 cookie(req){return /(?:^|;\s*)command_session=([a-f0-9]{64})(?:;|$)/.exec(req.headers.cookie||'')?.[1];}
 setCookie(res,token,maxAge=43200){res.setHeader('Set-Cookie',`${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${this.secure?'; Secure':''}`);}
 sameOrigin(req){return (!req.headers.origin||req.headers.origin===new URL(this.config.publicUrl).origin)&&req.headers['x-requested-with']==='CommandPanel';}
 identityFields(){return "u.id,u.email,u.name,u.role,u.access_mode,u.extra_permissions,u.signature_default,COALESCE((SELECT json_agg(connection_id ORDER BY connection_id) FROM user_connections WHERE user_id=u.id),'[]'::json) AS connections";}
 async identity(id){return resolveAccess(this.db,(await this.db.query('SELECT '+this.identityFields()+' FROM users u WHERE u.id=$1 AND u.active',[id])).rows[0]||null);}
 async user(req){const token=this.cookie(req);if(!token)return null;return resolveAccess(this.db,(await this.db.query('SELECT '+this.identityFields()+' FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=$1 AND s.expires_at>now() AND u.active',[digest(token)])).rows[0]||null);}

 async newSession(user,res){if(!await this.identity(user.id))throw Object.assign(new Error('Conta desativada.'),{status:401});const token=crypto.randomBytes(32).toString('hex');await this.db.query('DELETE FROM sessions WHERE expires_at<now()');await this.db.query("INSERT INTO sessions(token_hash,user_id,expires_at) VALUES($1,$2,now()+interval '12 hours')",[digest(token),user.id]);this.setCookie(res,token);}
 async throttled(key){const {rows}=await this.db.query("SELECT attempts FROM auth_throttle WHERE key=$1 AND window_start>now()-interval '15 minutes'",[key]);return (rows[0]?.attempts||0)>=10;}
 async fail(key){await this.db.query(`INSERT INTO auth_throttle(key) VALUES($1) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN auth_throttle.window_start<now()-interval '15 minutes' THEN 1 ELSE auth_throttle.attempts+1 END,window_start=CASE WHEN auth_throttle.window_start<now()-interval '15 minutes' THEN now() ELSE auth_throttle.window_start END`,[key]);}
 async handle(req,res,url,readBody,send){
  if(!url.pathname.startsWith('/auth/'))return false;
  const respond=(status,body)=>{send(res,status,body);return true;};
  if(req.method==='GET'&&url.pathname==='/auth/me'){const user=await this.user(req);return respond(user?200:401,user||'Entre com e-mail e senha.');}
  if(req.method!=='POST')return respond(404,'not found');
  if(!this.sameOrigin(req))return respond(403,'Origem da solicitação inválida.');
  if(url.pathname==='/auth/logout'){const token=this.cookie(req);if(token)await this.db.query('DELETE FROM sessions WHERE token_hash=$1',[digest(token)]);this.setCookie(res,'',0);return respond(200,{ok:true});}
  if(url.pathname==='/auth/password'){
   const user=await this.user(req);if(!user)return respond(401,'Entre novamente.');
   const body=JSON.parse((await readBody(req)).toString());
   if(!passwordValid(body.newPassword))return respond(400,'A nova senha deve ter de 8 a 256 caracteres.');
   const {rows}=await this.db.query('SELECT password_hash FROM users WHERE id=$1',[user.id]);
   const key=digest('password:'+user.id);if(await this.throttled(key))return respond(429,'Muitas tentativas. Aguarde 15 minutos.');
   if(!await verifyPassword(body.currentPassword,rows[0]?.password_hash)){await this.fail(key);return respond(401,'Senha atual incorreta.');}
   const encoded=await hashPassword(body.newPassword);
   await this.store.transaction(async tx=>{await tx.pool.query('UPDATE users SET password_hash=$1 WHERE id=$2',[encoded,user.id]);await tx.pool.query('DELETE FROM sessions WHERE user_id=$1',[user.id]);await tx.audit('password_changed',user.id);});
   await this.db.query('DELETE FROM auth_throttle WHERE key=$1',[key]);
   await this.newSession(user,res);return respond(200,{ok:true});
  }
  if(!['/auth/login','/auth/setup'].includes(url.pathname))return respond(404,'not found');
  const body=JSON.parse((await readBody(req)).toString());
  const email=normalizeEmail(body.email);
  const key=digest((req.headers['cf-connecting-ip']||req.socket.remoteAddress||'')+':'+email);
  if(await this.throttled(key))return respond(429,'Muitas tentativas. Aguarde 15 minutos.');
  const {rows}=await this.db.query('SELECT * FROM users WHERE email=$1 AND active',[email]);
  const user=rows[0];
  if(url.pathname==='/auth/setup'){
   const token=typeof body.setupToken==='string'?body.setupToken:'';
   if(!passwordValid(body.password))return respond(400,'A senha deve ter de 8 a 256 caracteres.');
   const encoded=await hashPassword(body.password);
   const {rowCount}=await this.db.query(`UPDATE users SET password_hash=$1,setup_hash=NULL,setup_expires_at=NULL WHERE email=$2 AND password_hash IS NULL AND setup_hash=$3 AND setup_expires_at>now() AND active`,[encoded,email,digest(token)]);
   if(!rowCount){await this.fail(key);return respond(401,'Link de ativação inválido, expirado ou já utilizado.');}
   await this.store.audit('account_activated',user.id);
  }else if(!await verifyPassword(body.password,user?.password_hash)){
   await this.fail(key);return respond(401,'E-mail ou senha incorretos.');
  }
  await this.db.query('DELETE FROM auth_throttle WHERE key=$1',[key]);
  await this.store.audit('login',user.id);
  await this.newSession(user,res);
  return respond(200,await this.identity(user.id));
 }
}
