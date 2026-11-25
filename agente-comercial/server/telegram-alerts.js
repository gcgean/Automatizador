// Alertas pelo Telegram: escolha de tipos por pessoa e vínculo por link (sem digitar Chat ID).
// Vínculo: o painel gera t.me/<bot>?start=<código>; a pessoa toca em Iniciar; o bot recebe "/start <código>"
// (consulta getUpdates, sem webhook) e grava o chat dela, cifrado.
import crypto from 'node:crypto';
import {encryptSecret,decryptSecret} from './secrets.js';
import {ALERT_IDS,defaultKinds,recipientKinds} from '../shared/alert-types.js';

const LINK_MINUTES=30;
export async function initTelegramAlerts(pool){
 await pool.query('ALTER TABLE commercial_telegram_recipients ADD COLUMN IF NOT EXISTS kinds text[]');
 await pool.query('ALTER TABLE commercial_telegram ADD COLUMN IF NOT EXISTS bot_username text');
 await pool.query('ALTER TABLE commercial_telegram ADD COLUMN IF NOT EXISTS update_offset bigint');
 await pool.query(`CREATE TABLE IF NOT EXISTS commercial_telegram_link_codes(code text PRIMARY KEY,company_id text NOT NULL REFERENCES companies(id),user_id uuid NOT NULL REFERENCES users(id),created_by uuid,created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL)`);
}
export function validKinds(kinds){
 if(!Array.isArray(kinds)||kinds.length>ALERT_IDS.length*2||kinds.some(k=>!ALERT_IDS.includes(k)))throw Object.assign(new Error('Tipos de alerta inválidos.'),{status:400});
 return [...new Set(kinds)];
}
// SQL: o destinatário r quer o tipo n.kind? (escolha salva ou padrão pelo perfil)
export const WANTS_SQL=(kind,r='r')=>`${kind}=ANY(COALESCE(${r}.kinds,CASE WHEN ${r}.manager THEN '{${defaultKinds(true).join(',')}}'::text[] ELSE '{${defaultKinds(false).join(',')}}'::text[] END))`;

async function call(fetchImpl,token,method,body){
 const response=await fetchImpl('https://api.telegram.org/bot'+token+'/'+method,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body||{}),signal:AbortSignal.timeout(10000)});
 const data=await response.json().catch(()=>({}));if(!response.ok||!data.ok)throw Object.assign(new Error('Telegram recusou: '+(data.description||response.status)),{status:502});return data.result;
}
export async function botUsername(pool,config,companyId,fetchImpl=fetch,{refresh=false}={}){
 const row=(await pool.query('SELECT token_cipher,bot_username FROM commercial_telegram WHERE company_id=$1',[companyId])).rows[0];
 if(!row?.token_cipher)return null;if(row.bot_username&&!refresh)return row.bot_username;
 const me=await call(fetchImpl,decryptSecret(row.token_cipher,config.connectionsKey),'getMe');
 await pool.query('UPDATE commercial_telegram SET bot_username=$2 WHERE company_id=$1',[companyId,me?.username||null]);return me?.username||null;
}
export async function createLink(pool,config,{companyId,userId,createdBy},fetchImpl=fetch){
 if(!(await pool.query('SELECT 1 FROM users WHERE id=$1 AND company_id=$2 AND active',[userId,companyId])).rowCount)throw Object.assign(new Error('Usuário indisponível.'),{status:400});
 const username=await botUsername(pool,config,companyId,fetchImpl);if(!username)throw Object.assign(new Error('Cadastre o token do bot antes de vincular pessoas.'),{status:400});
 const code=crypto.randomBytes(12).toString('base64url');
 await pool.query('DELETE FROM commercial_telegram_link_codes WHERE company_id=$1 AND (user_id=$2 OR expires_at<now())',[companyId,userId]);
 await pool.query("INSERT INTO commercial_telegram_link_codes(code,company_id,user_id,created_by,expires_at) VALUES($1,$2,$3,$4,now()+make_interval(mins=>$5))",[code,companyId,userId,createdBy||null,LINK_MINUTES]);
 return {url:'https://t.me/'+username+'?start='+code,expiresInMinutes:LINK_MINUTES};
}
// Lê as mensagens novas do bot e conclui vínculos pendentes. Só consulta se houver link aguardando.
export async function pollLinks(pool,config,companyId,fetchImpl=fetch){
 const bot=(await pool.query("SELECT t.token_cipher,t.update_offset FROM commercial_telegram t WHERE t.company_id=$1 AND t.token_cipher IS NOT NULL AND EXISTS(SELECT 1 FROM commercial_telegram_link_codes c WHERE c.company_id=t.company_id AND c.expires_at>now())",[companyId])).rows[0];
 if(!bot)return 0;
 const token=decryptSecret(bot.token_cipher,config.connectionsKey);
 const updates=await call(fetchImpl,token,'getUpdates',{offset:bot.update_offset||undefined,timeout:0,allowed_updates:['message']});
 let linked=0,offset=bot.update_offset;
 for(const u of updates){
  offset=Math.max(offset||0,u.update_id+1);
  const m=u.message,match=/^\/start\s+([A-Za-z0-9_-]{8,64})$/.exec(String(m?.text||'').trim());
  if(!match||m.chat?.type!=='private'||!m.chat?.id)continue;
  const code=(await pool.query('DELETE FROM commercial_telegram_link_codes WHERE code=$1 AND company_id=$2 AND expires_at>now() RETURNING user_id',[match[1],companyId])).rows[0];
  if(!code){await call(fetchImpl,token,'sendMessage',{chat_id:m.chat.id,text:'Este link de vínculo expirou ou já foi usado. Gere um novo no painel do Command Comercial.'}).catch(()=>{});continue;}
  const person=(await pool.query('SELECT name,role FROM users WHERE id=$1',[code.user_id])).rows[0];
  await pool.query(`INSERT INTO commercial_telegram_recipients(company_id,user_id,chat_cipher,manager,kinds) VALUES($1,$2,$3,$4,$5)
   ON CONFLICT(company_id,user_id) DO UPDATE SET chat_cipher=excluded.chat_cipher,kinds=COALESCE(commercial_telegram_recipients.kinds,excluded.kinds)`,[companyId,code.user_id,encryptSecret(String(m.chat.id),config.connectionsKey),person?.role==='admin',defaultKinds(person?.role==='admin')]);
  linked++;
  await call(fetchImpl,token,'sendMessage',{chat_id:m.chat.id,text:'Pronto'+(person?.name?', '+person.name.split(' ')[0]:'')+'! A partir de agora você recebe aqui os alertas do Command Comercial escolhidos no painel.'}).catch(()=>{});
 }
 if(offset!==bot.update_offset)await pool.query('UPDATE commercial_telegram SET update_offset=$2 WHERE company_id=$1',[companyId,offset]);
 return linked;
}
// Tipos "optIn": cria o aviso só para quem escolheu recebê-lo (e, se informado, só entre os usuários dados).
export async function notifyOptIn(pool,{companyId,connectionId,phone,kind,userIds=null}){
 const rows=(await pool.query(`SELECT r.user_id FROM commercial_telegram_recipients r JOIN users u ON u.id=r.user_id AND u.active JOIN commercial_telegram t ON t.company_id=r.company_id AND t.enabled WHERE r.company_id=$1 AND ${WANTS_SQL('$2::text')}`,[companyId,kind])).rows.map(r=>r.user_id).filter(id=>!userIds||userIds.includes(id));
 for(const id of rows)await pool.query('INSERT INTO user_notifications(id,user_id,company_id,connection_id,phone,kind) VALUES($1,$2,$3,$4,$5,$6)',[crypto.randomUUID(),id,companyId,connectionId,phone,kind]);
 return rows.length;
}
export {recipientKinds};
