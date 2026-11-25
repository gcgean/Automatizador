// Prospecção ativa (fase 1): chaves de API, base de prospects, importação da Casa dos Dados,
// campanhas e lotes com aprovação. O envio dos lotes aprovados entra na fase 2.
import crypto from 'node:crypto';
import {can} from '../shared/access.js';
import {CasaDosDados} from './casa-dos-dados.js';

const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const uuid=s=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(String(s||''));
const clean=(v,max=200)=>typeof v==='string'||typeof v==='number'?String(v).replace(/[\u0000-\u001f]/g,' ').replace(/\s+/g,' ').trim().slice(0,max):'';
export const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const UF=new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
export const STATUSES=['new','reserved','approved','sent','replied','qualified','discarded','optout','existing'];
export const SCOPES=['prospects:write','prospects:read'];

// Telefone brasileiro: só celular (fixo de empresa não tem WhatsApp e gera falha 131026 na Meta).
export function normalizePhone(raw){
 let d=String(raw||'').replace(/\D/g,'');
 if(d.startsWith('00'))d=d.slice(2);
 if(d.length>=12&&d.startsWith('55'))d=d.slice(2);
 if(d.startsWith('0'))d=d.replace(/^0+/,'');
 if(d.length!==10&&d.length!==11)return {reason:'invalido'};
 const ddd=d.slice(0,2),local=d.slice(2);if(+ddd<11||ddd[1]==='0')return {reason:'invalido'};
 if(local.length===9)return local[0]==='9'?{phone:'55'+ddd+local}:{reason:'invalido'};
 if(/^[6-9]/.test(local))return {phone:'55'+ddd+'9'+local};
 return {reason:'fixo'};
}
// CSV com ; ou , (Casa dos Dados exporta com ;), aspas e BOM.
export function parseCsv(text){
 const s=String(text||'').replace(/^﻿/,''),first=s.split(/\r?\n/,1)[0]||'',sep=(first.match(/;/g)||[]).length>=(first.match(/,/g)||[]).length?';':',';
 const rows=[];let row=[],cell='',quoted=false;
 for(let i=0;i<s.length;i++){const c=s[i];
  if(quoted){if(c==='"'){if(s[i+1]==='"'){cell+='"';i++;}else quoted=false;}else cell+=c;continue;}
  if(c==='"')quoted=true;else if(c===sep){row.push(cell);cell='';}else if(c==='\n'||c==='\r'){if(c==='\r'&&s[i+1]==='\n')i++;row.push(cell);cell='';if(row.some(v=>v.trim()))rows.push(row);row=[];}else cell+=c;}
 row.push(cell);if(row.some(v=>v.trim()))rows.push(row);
 return rows;
}
// Cabeçalhos da Casa dos Dados (e variações comuns) -> campos do prospect.
const COLUMN_RULES=[
 ['cnpj',h=>/\bcnpj\b/.test(h)&&!/raiz|basico/.test(h)],
 ['company',h=>/razao social|^nome empresarial|^empresa$/.test(h)],
 ['trade',h=>/fantasia/.test(h)],
 ['city',h=>/municipio|^cidade/.test(h)],
 ['uf',h=>/^uf$|^estado$|^sigla uf/.test(h)],
 ['segment',h=>/(cnae|atividade).*(descr|principal)|^segmento|^atividade$|descricao.*atividade/.test(h)&&!/secundar|codigo|^cnae principal codigo/.test(h)],
 ['cnae',h=>/^(cnae|codigo cnae|cnae principal codigo|cnae codigo)$|cnae.*cod/.test(h)],
 ['size',h=>/porte/.test(h)],
 ['email',h=>/e ?mail/.test(h)],
 ['capital',h=>/capital/.test(h)],
 ['opened',h=>/abertura|inicio.*ativ/.test(h)],
 ['neighborhood',h=>/^bairro/.test(h)],
 ['mei',h=>/^(opcao )?mei$|optante.*mei/.test(h)],
 ['contact',h=>/^(socio|responsavel|nome do contato|contato)/.test(h)],
 ['phone',h=>/telefone|celular|^fone|whats/.test(h)],
];
export function mapColumns(header){
 const map={phones:[]};header.forEach((raw,i)=>{const h=norm(raw);for(const [field,test] of COLUMN_RULES){if(!test(h))continue;if(field==='phone')map.phones.push(i);else if(map[field]===undefined)map[field]=i;break;}});
 // Descrição de CNAE pode vir como "CNAE Principal" com texto: se segment não achou, usa cnae com letras.
 return map;
}
export function rowToProspect(row,map){
 const get=k=>map[k]===undefined?'':clean(row[map[k]]);
 const phones=map.phones.flatMap(i=>String(row[i]||'').split(/[;,/|]|\s{2,}/)).map(p=>p.trim()).filter(Boolean);
 return {phones,cnpj:get('cnpj').replace(/\D/g,''),company:get('company'),trade:get('trade'),city:get('city'),uf:get('uf').toUpperCase(),segment:get('segment'),cnae:get('cnae'),size:get('size'),email:get('email'),
  profile:Object.fromEntries([['capital',get('capital')],['abertura',get('opened')],['bairro',get('neighborhood')],['mei',get('mei')],['contato',get('contact')]].filter(([,v])=>v))};
}
// Entrada da API (campos em português ou inglês).
export function apiToProspect(p){
 if(!p||typeof p!=='object')return null;
 const pick=(...k)=>{for(const key of k)if(p[key]!==undefined&&p[key]!==null)return p[key];return '';};
 const phones=[].concat(pick('telefone','phone','celular','whatsapp','telefones','phones')).flat().map(String);
 const profile=pick('perfil','profile');
 return {phones,cnpj:clean(pick('cnpj'),20).replace(/\D/g,''),company:clean(pick('razao_social','empresa','company','nome')),trade:clean(pick('nome_fantasia','fantasia','trade_name')),city:clean(pick('cidade','municipio','city'),80),uf:clean(pick('uf','estado','state'),2).toUpperCase(),
  segment:clean(pick('segmento','segment','atividade','cnae_descricao'),160),cnae:clean(pick('cnae','cnae_codigo'),20),size:clean(pick('porte','size'),60),email:clean(pick('email','e_mail'),160),
  source:clean(pick('origem','source'),80),consent:clean(pick('aceite','consent','opt_in'),200),
  profile:profile&&typeof profile==='object'&&!Array.isArray(profile)?Object.fromEntries(Object.entries(profile).slice(0,20).map(([k,v])=>[clean(k,40),clean(v,200)]).filter(([k,v])=>k&&v)):{}};
}

export class Prospecting{
 constructor(store,config={},{now=()=>new Date(),fetch}={}){this.store=store;this.config=config;this.now=now;this.rate=new Map();this.cdd=new CasaDosDados(this,{fetch});}
 get pool(){return this.store.pool;}
 async init(){
  await this.pool.query(`CREATE TABLE IF NOT EXISTS api_keys(id uuid PRIMARY KEY,company_id text NOT NULL REFERENCES companies(id),name text NOT NULL,prefix text NOT NULL,key_hash text NOT NULL UNIQUE,scopes text[] NOT NULL,created_by uuid,created_at timestamptz NOT NULL DEFAULT now(),last_used_at timestamptz,revoked_at timestamptz)`);
  await this.pool.query(`CREATE TABLE IF NOT EXISTS prospects(id uuid PRIMARY KEY,company_id text NOT NULL REFERENCES companies(id),phone text NOT NULL,cnpj text,company_name text,trade_name text,city text,uf text,segment text,cnae text,size text,email text,profile jsonb NOT NULL DEFAULT '{}',source text NOT NULL,consent text,status text NOT NULL DEFAULT 'new',status_reason text,campaign_id uuid,batch_id uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(company_id,phone))`);
  await this.pool.query('CREATE INDEX IF NOT EXISTS prospects_filter ON prospects(company_id,status,uf,city)');
  await this.cdd.init();
  await this.pool.query(`CREATE TABLE IF NOT EXISTS prospect_imports(id uuid PRIMARY KEY,company_id text NOT NULL REFERENCES companies(id),source text NOT NULL,file_name text,stats jsonb NOT NULL,created_by uuid,api_key_id uuid,created_at timestamptz NOT NULL DEFAULT now())`);
  await this.pool.query(`CREATE TABLE IF NOT EXISTS prospect_campaigns(id uuid PRIMARY KEY,company_id text NOT NULL REFERENCES companies(id),connection_id text NOT NULL REFERENCES whatsapp_connections(id),name text NOT NULL,template_name text NOT NULL,template_language text NOT NULL DEFAULT 'pt_BR',daily_limit int NOT NULL DEFAULT 50,status text NOT NULL DEFAULT 'active',created_by uuid,created_at timestamptz NOT NULL DEFAULT now())`);
  await this.pool.query(`CREATE TABLE IF NOT EXISTS prospect_batches(id uuid PRIMARY KEY,company_id text NOT NULL REFERENCES companies(id),campaign_id uuid NOT NULL REFERENCES prospect_campaigns(id),filter jsonb NOT NULL,size int NOT NULL,status text NOT NULL DEFAULT 'pending',created_by uuid,created_at timestamptz NOT NULL DEFAULT now(),decided_by uuid,decided_at timestamptz,note text)`);
 }

 // ---------- Chaves de API ----------
 async createKey(user,{name,scopes}){
  if(user.role!=='admin')throw fail('Somente administradores criam chaves de API.',403);
  const label=clean(name,80);if(label.length<3)throw fail('Dê um nome para a chave (ex.: Casa dos Dados).');
  const chosen=[...new Set(Array.isArray(scopes)&&scopes.length?scopes:['prospects:write'])];if(chosen.some(s=>!SCOPES.includes(s)))throw fail('Permissão de chave inválida.');
  const prefix=crypto.randomBytes(4).toString('hex'),secret=crypto.randomBytes(24).toString('base64url'),key='ck_'+prefix+'_'+secret;
  const id=crypto.randomUUID();
  await this.pool.query('INSERT INTO api_keys(id,company_id,name,prefix,key_hash,scopes,created_by) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,user.company_id,label,prefix,hash(key),chosen,user.id]);
  await this.store.audit?.('api_key_created',user.id,{companyId:user.company_id,keyId:id,scopes:chosen});
  return {id,name:label,prefix,scopes:chosen,key};// a chave completa só aparece aqui
 }
 async listKeys(user){if(user.role!=='admin')throw fail('Acesso restrito.',403);return (await this.pool.query('SELECT id,name,prefix,scopes,created_at,last_used_at,revoked_at FROM api_keys WHERE company_id=$1 ORDER BY created_at DESC',[user.company_id])).rows;}
 async revokeKey(user,id){if(user.role!=='admin')throw fail('Acesso restrito.',403);if(!uuid(id))throw fail('Chave inválida.');const r=await this.pool.query('UPDATE api_keys SET revoked_at=now() WHERE id=$1 AND company_id=$2 AND revoked_at IS NULL',[id,user.company_id]);if(!r.rowCount)throw fail('Chave não encontrada ou já revogada.',404);await this.store.audit?.('api_key_revoked',user.id,{companyId:user.company_id,keyId:id});return this.listKeys(user);}
 async authenticate(header){
  const m=/^Bearer\s+(ck_[a-f0-9]{8}_[A-Za-z0-9_-]{20,64})$/.exec(String(header||''));if(!m)return null;
  const row=(await this.pool.query('SELECT k.*,c.active FROM api_keys k JOIN companies c ON c.id=k.company_id WHERE k.key_hash=$1 AND k.revoked_at IS NULL',[hash(m[1])])).rows[0];
  if(!row||!row.active)return null;
  await this.pool.query('UPDATE api_keys SET last_used_at=now() WHERE id=$1 AND (last_used_at IS NULL OR last_used_at<now()-interval \'1 minute\')',[row.id]);
  return row;
 }
 limited(keyId){const minute=Math.floor(Date.now()/60000),k=keyId+':'+minute,n=(this.rate.get(k)||0)+1;this.rate.set(k,n);if(this.rate.size>500)for(const key of this.rate.keys())if(!key.endsWith(':'+minute))this.rate.delete(key);return n>60;}
 async handleApi(req,res,url,readBody,send){
  const key=await this.authenticate(req.headers.authorization);
  if(!key)return send(res,401,{error:'Chave de API inválida ou revogada.'});
  if(this.limited(key.id))return send(res,429,{error:'Limite de 60 requisições por minuto.'});
  try{
   if(url.pathname==='/api/v1/ping'&&req.method==='GET')return send(res,200,{ok:true,key:key.name,scopes:key.scopes});
   if(url.pathname==='/api/v1/prospects'&&req.method==='POST'){
    if(!key.scopes.includes('prospects:write'))return send(res,403,{error:'Esta chave não pode enviar prospects.'});
    const body=JSON.parse((await readBody(req,2*1024*1024)).toString('utf8'));const list=Array.isArray(body)?body:body?.prospects;
    if(!Array.isArray(list)||!list.length||list.length>1000)return send(res,400,{error:'Envie {"prospects":[...]} com 1 a 1000 itens.'});
    const stats=await this.ingest(key.company_id,list.map(apiToProspect),{source:'api:'+key.name,apiKeyId:key.id});
    return send(res,200,stats);
   }
   if(url.pathname==='/api/v1/prospects'&&req.method==='GET'){
    if(!key.scopes.includes('prospects:read'))return send(res,403,{error:'Esta chave não pode consultar prospects.'});
    const status=url.searchParams.get('status');const limit=Math.min(500,Math.max(1,+url.searchParams.get('limit')||100));
    const rows=(await this.pool.query('SELECT phone,cnpj,company_name,trade_name,city,uf,segment,size,status,updated_at FROM prospects WHERE company_id=$1 AND ($2::text IS NULL OR status=$2) ORDER BY updated_at DESC LIMIT $3',[key.company_id,STATUSES.includes(status)?status:null,limit])).rows;
    return send(res,200,{prospects:rows});
   }
   return send(res,404,{error:'Endpoint não encontrado.'});
  }catch(e){return send(res,e.status||400,{error:e instanceof SyntaxError?'JSON inválido.':e.message});}
 }

 // ---------- Entrada de prospects ----------
 async ingest(companyId,items,{source,consent=null,apiKeyId=null,userId=null,fileName=null}){
  const stats={received:items.length,created:0,updated:0,skipped:{}};const skip=r=>{stats.skipped[r]=(stats.skipped[r]||0)+1;};
  const connections=(await this.pool.query('SELECT id FROM whatsapp_connections WHERE company_id=$1',[companyId])).rows.map(r=>r.id);
  const seen=new Set(),ready=[];
  for(const p of items){
   if(!p){skip('invalido');continue;}
   let phone=null,reason='sem_telefone';for(const raw of p.phones||[]){const n=normalizePhone(raw);if(n.phone){phone=n.phone;break;}reason=n.reason==='fixo'?'so_fixo':'invalido';}
   if(!phone){skip(reason);continue;}
   if(seen.has(phone)){skip('duplicado_no_arquivo');continue;}seen.add(phone);ready.push({p,phone});
  }
  // Já é contato (conversa, cliente) ou pediu para sair: não entra como prospecção nova.
  const known=new Map();for(let i=0;i<ready.length&&connections.length;i+=1000)for(const r of (await this.pool.query("SELECT phone,bool_or(coalesce((data->>'optedOut')::boolean,false)) AS opted FROM leads WHERE connection_id=ANY($1) AND phone=ANY($2) GROUP BY phone",[connections,ready.slice(i,i+1000).map(x=>x.phone)])).rows)known.set(r.phone,r.opted);
  for(const {p,phone} of ready){
   const uf=UF.has(p.uf)?p.uf:null;
   const status=known.get(phone)===true?'optout':known.has(phone)?'existing':'new';
   const r=await this.pool.query(`INSERT INTO prospects(id,company_id,phone,cnpj,company_name,trade_name,city,uf,segment,cnae,size,email,profile,source,consent,status,status_reason)
    VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
    ON CONFLICT(company_id,phone) DO UPDATE SET cnpj=COALESCE(NULLIF(excluded.cnpj,''),prospects.cnpj),company_name=COALESCE(NULLIF(excluded.company_name,''),prospects.company_name),trade_name=COALESCE(NULLIF(excluded.trade_name,''),prospects.trade_name),city=COALESCE(NULLIF(excluded.city,''),prospects.city),uf=COALESCE(excluded.uf,prospects.uf),segment=COALESCE(NULLIF(excluded.segment,''),prospects.segment),cnae=COALESCE(NULLIF(excluded.cnae,''),prospects.cnae),size=COALESCE(NULLIF(excluded.size,''),prospects.size),email=COALESCE(NULLIF(excluded.email,''),prospects.email),profile=prospects.profile||excluded.profile,updated_at=now()
    RETURNING (xmax=0) AS inserted`,
    [crypto.randomUUID(),companyId,phone,p.cnpj||null,p.company||null,p.trade||null,p.city?titleCase(p.city):null,uf,p.segment||null,p.cnae||null,p.size||null,p.email||null,p.profile||{},p.source||source,p.consent||consent,status,status==='new'?null:status==='optout'?'Contato pediu para não receber mensagens':'Já é contato da empresa']);
   if(r.rows[0].inserted){stats.created++;if(status!=='new')skip(status==='optout'?'descadastrado':'ja_e_contato');}else stats.updated++;
  }
  await this.pool.query('INSERT INTO prospect_imports(id,company_id,source,file_name,stats,created_by,api_key_id) VALUES($1,$2,$3,$4,$5,$6,$7)',[crypto.randomUUID(),companyId,source,fileName,stats,userId,apiKeyId]);
  return stats;
 }
 async importCsv(user,{csv,fileName,consent}){
  this.need(user,'prospecting.manage');
  if(typeof csv!=='string'||csv.length<10)throw fail('Arquivo vazio.');
  const rows=parseCsv(csv);if(rows.length<2)throw fail('O arquivo precisa ter cabeçalho e ao menos uma linha.');
  if(rows.length>50001)throw fail('Importe até 50 mil linhas por vez.');
  const map=mapColumns(rows[0]);if(!map.phones.length)throw fail('Não encontrei coluna de telefone no arquivo. Exporte da Casa dos Dados com os telefones.');
  const stats=await this.ingest(user.company_id,rows.slice(1).map(r=>rowToProspect(r,map)),{source:'casa-dos-dados',consent:clean(consent,200)||null,userId:user.id,fileName:clean(fileName,120)||null});
  await this.store.audit?.('prospects_imported',user.id,{companyId:user.company_id,...stats,skipped:undefined});
  return {...stats,columns:Object.fromEntries(Object.entries(map).filter(([k,v])=>k!=='phones'&&v!==undefined).map(([k,v])=>[k,rows[0][v]])),phoneColumns:map.phones.map(i=>rows[0][i])};
 }

 // ---------- Consulta ----------
 need(user,permission){if(!can(user,permission))throw fail('Seu acesso não permite esta função.',403);}
 where(companyId,f={},extra=[]){
  const params=[companyId],cond=['company_id=$1'];const add=(sql,v)=>{params.push(v);cond.push(sql.replace('?','$'+params.length));};
  if(f.status&&STATUSES.includes(f.status))add('status=?',f.status);
  if(f.uf&&UF.has(f.uf))add('uf=?',f.uf);
  if(f.city)add('city=?',clean(f.city,80));
  if(f.segment)add('segment=?',clean(f.segment,160));
  if(f.size)add('size=?',clean(f.size,60));
  if(f.q)add("(company_name ILIKE ? OR trade_name ILIKE $X OR phone LIKE $X OR cnpj LIKE $X)".replace(/\$X/g,'$'+(params.length+1)),'%'+clean(f.q,80).replace(/[%_]/g,'')+'%');
  for(const e of extra)cond.push(e);
  return {sql:cond.join(' AND '),params};
 }
 async summary(user,f={}){
  this.need(user,'prospecting.view');
  const w=this.where(user.company_id,f);
  const facet=async col=>(await this.pool.query(`SELECT ${col} AS value,count(*)::int AS n FROM prospects WHERE ${w.sql} AND ${col} IS NOT NULL AND ${col}<>'' GROUP BY 1 ORDER BY 2 DESC LIMIT 60`,w.params)).rows;
  const status=Object.fromEntries((await this.pool.query(`SELECT status,count(*)::int n FROM prospects WHERE company_id=$1 GROUP BY 1`,[user.company_id])).rows.map(r=>[r.status,r.n]));
  return {status,total:Object.values(status).reduce((a,b)=>a+b,0),filtered:(await this.pool.query(`SELECT count(*)::int n FROM prospects WHERE ${w.sql}`,w.params)).rows[0].n,
   facets:{uf:await facet('uf'),city:await facet('city'),segment:await facet('segment'),size:await facet('size')},
   imports:(await this.pool.query('SELECT source,file_name,stats,created_at FROM prospect_imports WHERE company_id=$1 ORDER BY created_at DESC LIMIT 5',[user.company_id])).rows};
 }
 async list(user,f={}){
  this.need(user,'prospecting.view');const w=this.where(user.company_id,f);const limit=Math.min(200,Math.max(1,+f.limit||50)),offset=Math.max(0,+f.offset||0);
  return (await this.pool.query(`SELECT id,phone,cnpj,company_name,trade_name,city,uf,segment,size,status,status_reason,source,updated_at FROM prospects WHERE ${w.sql} ORDER BY updated_at DESC LIMIT ${limit} OFFSET ${offset}`,w.params)).rows;
 }

 // ---------- Campanhas e lotes ----------
 async campaigns(user){
  this.need(user,'prospecting.view');
  const campaigns=(await this.pool.query(`SELECT c.*,w.name AS connection_name,(SELECT count(*)::int FROM prospects p WHERE p.campaign_id=c.id) AS prospects FROM prospect_campaigns c JOIN whatsapp_connections w ON w.id=c.connection_id WHERE c.company_id=$1 ORDER BY c.created_at DESC`,[user.company_id])).rows;
  const batches=(await this.pool.query(`SELECT b.*,c.name AS campaign_name,u.name AS created_by_name,d.name AS decided_by_name FROM prospect_batches b JOIN prospect_campaigns c ON c.id=b.campaign_id LEFT JOIN users u ON u.id=b.created_by LEFT JOIN users d ON d.id=b.decided_by WHERE b.company_id=$1 ORDER BY b.created_at DESC LIMIT 50`,[user.company_id])).rows;
  return {campaigns,batches};
 }
 async saveCampaign(user,body){
  this.need(user,'prospecting.manage');
  const name=clean(body.name,100),template=clean(body.templateName,120),limit=Math.round(+body.dailyLimit||50);
  if(name.length<3)throw fail('Dê um nome para a campanha.');if(!/^[a-z0-9_]{1,120}$/.test(template))throw fail('Escolha um modelo aprovado.');if(limit<1||limit>1000)throw fail('Limite diário entre 1 e 1000.');
  const conn=(await this.pool.query('SELECT id FROM whatsapp_connections WHERE id=$1 AND company_id=$2',[body.connectionId,user.company_id])).rows[0];if(!conn)throw fail('Conexão inválida.');
  if(user.role!=='admin'&&!(user.connections||[]).includes(conn.id))throw fail('Você não tem acesso a esta conexão.',403);
  const id=uuid(body.id)?body.id:crypto.randomUUID();
  await this.pool.query(`INSERT INTO prospect_campaigns(id,company_id,connection_id,name,template_name,template_language,daily_limit,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
   ON CONFLICT(id) DO UPDATE SET name=excluded.name,template_name=excluded.template_name,template_language=excluded.template_language,daily_limit=excluded.daily_limit,connection_id=excluded.connection_id WHERE prospect_campaigns.company_id=excluded.company_id`,[id,user.company_id,conn.id,name,template,clean(body.templateLanguage,10)||'pt_BR',limit,user.id]);
  await this.store.audit?.('prospect_campaign_saved',user.id,{companyId:user.company_id,campaignId:id});
  return this.campaigns(user);
 }
 async setCampaignStatus(user,id,status){this.need(user,'prospecting.manage');if(!['active','paused'].includes(status))throw fail('Situação inválida.');await this.pool.query('UPDATE prospect_campaigns SET status=$3 WHERE id=$1 AND company_id=$2',[id,user.company_id,status]);return this.campaigns(user);}
 // Monta um lote com N prospects novos que batem com o filtro; ficam reservados até a aprovação.
 async createBatch(user,body){
  this.need(user,'prospecting.manage');
  const campaign=uuid(body.campaignId)&&(await this.pool.query('SELECT * FROM prospect_campaigns WHERE id=$1 AND company_id=$2',[body.campaignId,user.company_id])).rows[0];if(!campaign)throw fail('Escolha a campanha.');
  const size=Math.round(+body.size||0);if(size<1||size>1000)throw fail('O lote deve ter de 1 a 1000 contatos.');
  const filter={uf:body.filter?.uf||'',city:body.filter?.city||'',segment:body.filter?.segment||'',size:body.filter?.size||''};
  return this.store.transaction(async tx=>{
   const w=this.where(user.company_id,{...filter,status:'new'});const id=crypto.randomUUID();
   const picked=await tx.pool.query(`UPDATE prospects SET status='reserved',batch_id=$${w.params.length+1},campaign_id=$${w.params.length+2},updated_at=now() WHERE id IN (SELECT id FROM prospects WHERE ${w.sql} ORDER BY created_at LIMIT ${size} FOR UPDATE SKIP LOCKED) RETURNING id`,[...w.params,id,campaign.id]);
   if(!picked.rowCount)throw fail('Nenhum contato novo com esse filtro.');
   await tx.pool.query('INSERT INTO prospect_batches(id,company_id,campaign_id,filter,size,created_by) VALUES($1,$2,$3,$4,$5,$6)',[id,user.company_id,campaign.id,filter,picked.rowCount,user.id]);
   await tx.audit?.('prospect_batch_created',user.id,{companyId:user.company_id,batchId:id,size:picked.rowCount});
   return {id,size:picked.rowCount};
  });
 }
 async batchItems(user,id){this.need(user,'prospecting.view');if(!uuid(id))throw fail('Lote inválido.');return (await this.pool.query('SELECT id,phone,company_name,trade_name,city,uf,segment,size,status FROM prospects WHERE company_id=$1 AND batch_id=$2 ORDER BY company_name',[user.company_id,id])).rows;}
 async removeFromBatch(user,id,prospectId){
  this.need(user,'prospecting.manage');
  const r=await this.pool.query("UPDATE prospects SET status='new',batch_id=NULL,campaign_id=NULL,updated_at=now() WHERE id=$1 AND company_id=$2 AND batch_id=$3 AND status='reserved' AND EXISTS(SELECT 1 FROM prospect_batches b WHERE b.id=$3 AND b.status='pending')",[prospectId,user.company_id,id]);
  if(!r.rowCount)throw fail('Só dá para tirar contatos de lotes aguardando aprovação.');
  await this.pool.query("UPDATE prospect_batches SET size=size-1 WHERE id=$1",[id]);return this.batchItems(user,id);
 }
 async decideBatch(user,id,decision,note){
  this.need(user,'prospecting.approve');if(!uuid(id)||!['approve','reject'].includes(decision))throw fail('Decisão inválida.');
  return this.store.transaction(async tx=>{
   const b=(await tx.pool.query("SELECT * FROM prospect_batches WHERE id=$1 AND company_id=$2 AND status='pending' FOR UPDATE",[id,user.company_id])).rows[0];if(!b)throw fail('Lote não está aguardando aprovação.',409);
   if(decision==='approve')await tx.pool.query("UPDATE prospects SET status='approved',updated_at=now() WHERE batch_id=$1 AND status='reserved'",[id]);
   else await tx.pool.query("UPDATE prospects SET status='new',batch_id=NULL,campaign_id=NULL,updated_at=now() WHERE batch_id=$1 AND status='reserved'",[id]);
   await tx.pool.query('UPDATE prospect_batches SET status=$2,decided_by=$3,decided_at=now(),note=$4 WHERE id=$1',[id,decision==='approve'?'approved':'rejected',user.id,clean(note,300)||null]);
   await tx.audit?.('prospect_batch_'+decision,user.id,{companyId:user.company_id,batchId:id});
   return {ok:true};
  });
 }

 // ---------- Rotas do painel ----------
 async handlePanel(req,res,url,readBody,send,user){
  try{
   if(!(await this.pool.query('SELECT 1 FROM companies WHERE id=$1 AND active',[user.company_id])).rowCount)return send(res,403,'Empresa pausada.');
   const q=Object.fromEntries(url.searchParams),path=url.pathname;
   if(req.method==='GET'){
    if(path==='/prospecting/summary')return send(res,200,await this.summary(user,q));
    if(path==='/prospecting/prospects')return send(res,200,await this.list(user,q));
    if(path==='/prospecting/campaigns')return send(res,200,await this.campaigns(user));
    if(path==='/prospecting/keys')return send(res,200,await this.listKeys(user));
    if(path.startsWith('/prospecting/cdd')){const out=await this.cdd.handle(req,path,{},user);if(out!==undefined)return send(res,200,out);}
    const items=path.match(/^\/prospecting\/batches\/([a-f0-9-]{36})$/i);if(items)return send(res,200,await this.batchItems(user,items[1]));
    return send(res,404,'not found');
   }
   if(req.method!=='POST')return send(res,405,'Método não permitido.');
   const body=JSON.parse((await readBody(req,path==='/prospecting/import'?20*1024*1024:65536)).toString('utf8')||'{}');
   if(path==='/prospecting/import')return send(res,200,await this.importCsv(user,body));
   if(path==='/prospecting/keys')return send(res,200,await this.createKey(user,body));
   if(path.startsWith('/prospecting/cdd/')){const out=await this.cdd.handle(req,path,body,user);if(out!==undefined)return send(res,200,out);}
   if(path==='/prospecting/keys/revoke')return send(res,200,await this.revokeKey(user,body.id));
   if(path==='/prospecting/campaigns')return send(res,200,await this.saveCampaign(user,body));
   if(path==='/prospecting/campaigns/status')return send(res,200,await this.setCampaignStatus(user,body.id,body.status));
   if(path==='/prospecting/batches')return send(res,200,await this.createBatch(user,body));
   const m=path.match(/^\/prospecting\/batches\/([a-f0-9-]{36})\/(approve|reject|remove)$/i);
   if(m)return send(res,200,m[2]==='remove'?await this.removeFromBatch(user,m[1],body.prospectId):await this.decideBatch(user,m[1],m[2],body.note));
   return send(res,404,'not found');
  }catch(e){return send(res,e.status||400,e instanceof SyntaxError?'Dados inválidos.':e.message);}
 }
}
const hash=key=>crypto.createHash('sha256').update(key).digest('hex');
const titleCase=s=>String(s).toLowerCase().replace(/(^|\s|-)(\p{L})/gu,(m,a,b)=>a+b.toUpperCase()).replace(/\b(De|Da|Do|Das|Dos|E)\b/g,w=>w.toLowerCase());
