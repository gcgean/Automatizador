import {encryptSecret,decryptSecret} from './secrets.js';
import {costPeriod} from './meta-costs.js';
import {canUseMetaDashboard} from '../shared/access.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const numeric=value=>{if(value===null||value===undefined||value==='')return null;const n=Number(value);return Number.isFinite(n)&&n>=0?n:null;};
const round=n=>Math.round((n+Number.EPSILON)*1e8)/1e8;
export function adMetrics(row){
 const spend=numeric(row.spend),impressions=numeric(row.impressions),clicks=numeric(row.clicks);
 if(spend===null||impressions===null||clicks===null||row.actions!==undefined&&!Array.isArray(row.actions))throw fail('A Meta retornou indicadores incompletos.',502);
 const action=type=>{const items=(row.actions||[]).filter(a=>a.action_type===type);if(items.some(a=>numeric(a.value)===null))throw fail('A Meta retornou ações inválidas.',502);return items.reduce((s,a)=>s+numeric(a.value),0);};
 return {spend,impressions,clicks,conversations:action('onsite_conversion.messaging_conversation_started_7d'),metaLeads:action('lead')};
}
export const isRecruitment=name=>/(?:contratac|contratar|recrutamento|vaga(?:s)? (?:de|para)|venha fazer parte da empresa)/.test(String(name||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase());
const phoneDigits=s=>String(s||'').replace(/\D/g,'');
export function scopeAd(ad,scopes,connections,local=[]){
 const scope=scopes.find(s=>s.campaignId===ad.campaignId),connection=connections.find(c=>c.id===scope?.connectionId),purpose=isRecruitment(ad.campaign)?'recruitment':scope?.purpose||'unknown';
 let reason=null;
 if(purpose!=='commercial')reason=purpose==='recruitment'?'Recrutamento: fora das vendas.':purpose==='other'?'Outro objetivo: fora do CPL comercial.':'Campanha ainda não classificada.';
 else if(!connection)reason='Conexão da campanha indisponível.';
 else if(!['whatsapp','page_whatsapp'].includes(scope.destination))reason='Destino diferente de WhatsApp.';
 else if(!scope.phoneConfirmed||!scope.phone)reason='Número de destino ainda não confirmado.';
 else if(phoneDigits(scope.phone)!==phoneDigits(connection.displayPhone))reason='Destino fora dos números desta ferramenta.';
 const destinationEligible=!reason;
 const matched=purpose==='commercial'&&connection?local.filter(l=>l.ad_id===ad.id&&l.connection_id===connection.id):[];
 const sum=key=>matched.reduce((n,l)=>n+(l[key]||0),0),since=scope?.phoneVerifiedFrom||null;
 if(!reason&&since&&ad.dailySpend?.length&&ad.dailySpend.every(d=>d.day<since))reason='Período anterior ao destino confirmado.';
 const eligibleSpend=reason?0:round(ad.dailySpend?ad.dailySpend.filter(d=>!since||d.day>=since).reduce((n,d)=>n+d.spend,0):ad.spend),eligibleContacts=reason?0:matched.filter(l=>!since||l.day>=since).reduce((n,l)=>n+l.contacts,0);

 return {...ad,purpose,connectionId:connection?.id||null,connectionName:connection?.name||null,destination:scope?.destination||'unknown',destinationPhone:scope?.phone||null,phoneConfirmed:!!scope?.phoneConfirmed,destinationEligible,cplEligible:!reason,cplReason:reason,contacts:sum('contacts'),qualified:sum('qualified'),won:sum('won'),phoneVerifiedFrom:since,eligibleSpend,eligibleContacts,costPerConversation:purpose==='commercial'&&['whatsapp','page_whatsapp'].includes(scope?.destination)&&ad.conversations?round(ad.spend/ad.conversations):null,estimatedCostPerContact:!reason&&eligibleContacts?round(eligibleSpend/eligibleContacts):null};
}
// Compare campaigns using one common attribution window, rather than mixing old spend with today's contacts.
export function qualificationReport(cards,local,{from,to,complete=true,minQualified=5,currency='BRL'}={}){
 const scoped=cards.filter(a=>a.purpose==='commercial'&&a.connectionId),eligible=scoped.filter(a=>a.destinationEligible);
 const since=eligible.reduce((date,a)=>a.phoneVerifiedFrom&&a.phoneVerifiedFrom>date?a.phoneVerifiedFrom:date,from),inWindow=day=>typeof day==='string'&&day>=since&&day<=to;
 const campaigns=new Map(),daily=new Map();
 for(const ad of scoped){
  const key=ad.connectionId+':'+ad.campaignId;let campaign=campaigns.get(key);
  if(!campaign){campaign={id:ad.campaignId,connectionId:ad.connectionId,connectionName:ad.connectionName,name:ad.campaign,spend:0,contacts:0,qualified:0,won:0,crmLinked:0,crmVerified:0,undatedWon:0,unpricedWon:0,soldValue:0,ads:0,destinationEligible:ad.destinationEligible,reason:ad.destinationEligible?null:ad.cplReason};campaigns.set(key,campaign);}
  campaign.ads++;
  if(!ad.destinationEligible)continue;
  for(const d of ad.dailySpend||[])if(inWindow(d.day)){campaign.spend+=d.spend;const point=daily.get(d.day)||{day:d.day,spend:0,contacts:0,qualified:0};point.spend+=d.spend;daily.set(d.day,point);}
  for(const l of local)if(l.ad_id===ad.id&&l.connection_id===ad.connectionId&&inWindow(l.day)){campaign.contacts+=l.contacts;campaign.qualified+=l.qualified;campaign.won+=l.won;
   campaign.crmLinked+=l.crm_linked||0;
   campaign.crmVerified+=l.crm_verified||0;
   campaign.undatedWon+=l.undated_won||0;
   campaign.unpricedWon+=l.unpriced_won||0;
   campaign.soldValue+=l.sold_value||0;const point=daily.get(l.day)||{day:l.day,spend:0,contacts:0,qualified:0};point.contacts+=l.contacts;point.qualified+=l.qualified;daily.set(l.day,point);}
 }
 const rows=[...campaigns.values()].map(c=>{const spend=round(c.spend),rate=c.contacts?round(100*c.qualified/c.contacts):null,cost=spend>0&&c.qualified>0?round(spend/c.qualified):null;
  const status=!c.destinationEligible?'ineligible':since>to?'outside_window':!spend?'no_spend':!c.contacts?'no_contacts':!c.qualified?'no_qualified':c.qualified<minQualified?'small_sample':'comparable';
  const dealsChecked=complete&&c.crmVerified>0&&c.crmLinked===c.crmVerified&&!c.undatedWon;
  const soldValue=dealsChecked&&!c.unpricedWon&&currency==='BRL'?round(c.soldValue):null;
  return {...c,spend,soldValue,costPerSale:dealsChecked&&c.won&&spend>0?round(spend/c.won):null,
   averageSale:soldValue!==null&&c.won?round(soldValue/c.won):null,
   salesReturn:soldValue!==null&&c.won&&spend>0?round(soldValue/spend):null,qualificationRate:rate,costPerQualified:cost,estimatedCpl:spend>0&&c.contacts?round(spend/c.contacts):null,status};
 }).sort((a,b)=>(a.costPerQualified??Infinity)-(b.costPerQualified??Infinity)||(b.qualificationRate??-1)-(a.qualificationRate??-1)||b.qualified-a.qualified||a.id.localeCompare(b.id));
 const sum=key=>round(rows.reduce((n,c)=>n+c[key],0)),totals={spend:sum('spend'),contacts:sum('contacts'),qualified:sum('qualified'),won:sum('won')};totals.costPerQualified=totals.spend>0&&totals.qualified?round(totals.spend/totals.qualified):null;totals.estimatedCpl=totals.spend>0&&totals.contacts?round(totals.spend/totals.contacts):null;totals.qualificationRate=totals.contacts?round(100*totals.qualified/totals.contacts):null;
 const best=complete?rows.find(c=>c.status==='comparable')||null:null;
 return {from:since,to,requestedFrom:from,windowAvailable:since<=to,complete,minQualified,totals,campaigns:rows,best,daily:[...daily.values()].sort((a,b)=>a.day.localeCompare(b.day)).map(d=>({...d,spend:round(d.spend)})),definition:'Uma conversa qualificada é um contato por conexão marcado como Qualificado no sistema, pelo operador ou após confirmação do CRM. Temperatura morna/quente não conta sozinha. A qualificação é a situação atual dos contatos atribuídos por data de entrada/clique registrado; não a data em que foram qualificados.',method:'Custo por qualificada = investimento elegível ÷ contatos qualificados atribuídos na mesma janela. CPL estimado = investimento elegível ÷ todos os contatos atribuídos nessa base. São médias, não cobranças individuais. Para comparar, todas as campanhas usam a mesma data inicial, a mais recente entre o período solicitado e os destinos confirmados. A indicação exige pelo menos '+minQualified+' qualificados; é um critério operacional, não garantia estatística ou de retorno.'};
}
export class MetaAds{
 constructor(store,registry,config,{fetchImpl=fetch,now=()=>Date.now()}={}){this.store=store;this.registry=registry;this.config=config;this.fetch=fetchImpl;this.now=now;this.cache=new Map();this.pending=new Map();}
 admin(user){if(user?.role!=='admin')throw fail('Somente administradores podem consultar custos de anúncios.',403);}
 async connection(id,companyId){const c=await this.store.getConnection(id);if(c.company_id!==companyId)throw fail('Conexão não encontrada nesta empresa.',404);return this.registry.configFor(id);}
 async graph(cfg,path,params={}){
  const url=new URL('https://graph.facebook.com/'+cfg.graphVersion+'/'+path);for(const [k,v] of Object.entries(params))url.searchParams.set(k,typeof v==='string'?v:JSON.stringify(v));
  let response,body;try{response=await this.fetch(url,{headers:{Authorization:'Bearer '+cfg.accessToken},signal:AbortSignal.timeout(25000),redirect:'error'});body=await response.json();}catch{throw fail('Não foi possível consultar os anúncios na Meta. Tente novamente.',502);}
  if(!response.ok){if([10,200,190].includes(body.error?.code))throw fail('Acesso aos anúncios indisponível. Configure um token com ads_read e acesso à conta de anúncios escolhida.',403);throw fail('A Meta não concluiu a consulta de anúncios. Verifique a conta e tente novamente.',502);}return body;
 }
 async record(companyId){return (await this.store.pool.query('SELECT * FROM meta_ads_accounts WHERE company_id=$1',[companyId])).rows[0];}
 async settings(user){this.admin(user);const row=await this.record(user.company_id);return row?{enabled:row.enabled,connectionId:row.connection_id,accountId:row.account_id,name:row.account_name,currency:row.currency,timezone:row.timezone_name,hasDedicatedToken:!!row.access_token_cipher,updatedAt:row.updated_at,campaignScopes:row.campaign_scopes||[]}:{enabled:false};}
 async accounts(user,connectionId){this.admin(user);const cfg=await this.connection(connectionId,user.company_id);const data=await this.graph(cfg,'me/adaccounts',{fields:'id,name,currency,timezone_name',limit:100});return {accounts:data.data||[],more:!!data.paging?.next};}
 async save(user,body){
  this.admin(user);if(body.enabled===false){await this.store.pool.query('UPDATE meta_ads_accounts SET enabled=false,access_token_cipher=NULL,updated_at=now() WHERE company_id=$1',[user.company_id]);this.cache.clear();return this.settings(user);}
  if(typeof body.connectionId!=='string'||!/^act_[0-9]{5,30}$/.test(body.accountId||'')||body.token!==undefined&&(typeof body.token!=='string'||body.token.trim().length<20||body.token.length>8192))throw fail('Informe a conexão, conta act_ seguida do ID e um token válido.');
  const cfg=await this.connection(body.connectionId,user.company_id),old=await this.record(user.company_id),token=body.token?.trim()||(old?.connection_id===body.connectionId&&old.access_token_cipher?decryptSecret(old.access_token_cipher,this.config.connectionsKey):null);
  if(token)cfg.accessToken=token;const account=await this.graph(cfg,body.accountId,{fields:'id,name,currency,timezone_name'});
  if(account.id!==body.accountId||!/^[A-Z]{3}$/.test(account.currency||'')||typeof account.name!=='string'||typeof account.timezone_name!=='string')throw fail('A Meta não confirmou a conta e sua moeda/fuso.',502);
  try{await this.store.transaction(async tx=>{await tx.pool.query(`INSERT INTO meta_ads_accounts(company_id,connection_id,account_id,account_name,currency,timezone_name,access_token_cipher,enabled) VALUES($1,$2,$3,$4,$5,$6,$7,true) ON CONFLICT(company_id) DO UPDATE SET connection_id=excluded.connection_id,account_id=excluded.account_id,account_name=excluded.account_name,currency=excluded.currency,timezone_name=excluded.timezone_name,access_token_cipher=excluded.access_token_cipher,campaign_scopes=CASE WHEN meta_ads_accounts.account_id=excluded.account_id THEN meta_ads_accounts.campaign_scopes ELSE '[]'::jsonb END,enabled=true,updated_at=now()`,[user.company_id,body.connectionId,account.id,account.name,account.currency,account.timezone_name,token?encryptSecret(token,this.config.connectionsKey):null]);await tx.audit('meta_ads_connected',user.id,{companyId:user.company_id,accountId:account.id});});}catch(e){if(e.code==='23505')throw fail('Esta conta de anúncios já está vinculada a outra empresa.',409);throw e;}
  this.cache.clear();return this.settings(user);
 }
 async accountConfig(user,{analysis=false}={}){if(!analysis)this.admin(user);else if(!canUseMetaDashboard(user,'analysis'))throw fail('Seu acesso não permite analisar campanhas.',403);const row=await this.record(user.company_id);if(!row?.enabled)throw fail('Conecte a conta de anúncios primeiro.');const cfg=await this.connection(row.connection_id,user.company_id);if(row.access_token_cipher)cfg.accessToken=decryptSecret(row.access_token_cipher,this.config.connectionsKey);return {row,cfg};}
 async campaigns(user){const {row,cfg}=await this.accountConfig(user);const campaigns=[],seen=new Set();let cursor=null;for(let i=0;i<20;i++){const r=await this.graph(cfg,row.account_id+'/campaigns',{fields:'id,name,objective,status',limit:100,...(cursor?{after:cursor}:{})});if(!Array.isArray(r.data))throw fail('A Meta não retornou as campanhas.',502);campaigns.push(...r.data.map(c=>({id:c.id,name:c.name,objective:c.objective,status:c.status})));if(!r.paging?.next)return {campaigns,scopes:row.campaign_scopes||[]};const after=r.paging.cursors?.after;if(!after||seen.has(after))break;seen.add(after);cursor=after;}throw fail('Lista de campanhas incompleta; confira o acesso e tente novamente.',502);}
 async saveScopes(user,body){
  this.admin(user);const scopes=body.scopes;if(!Array.isArray(scopes)||scopes.length>2000||new Set(scopes.map(s=>s.campaignId)).size!==scopes.length)throw fail('Informe uma classificação por campanha.');
  const connections=(await this.registry.list()).filter(c=>c.companyId===user.company_id),live=await this.campaigns(user),row=await this.record(user.company_id),today=new Intl.DateTimeFormat('en-CA',{timeZone:row.timezone_name}).format(new Date(this.now())),clean=[];
  for(const scope of scopes){const campaign=live.campaigns.find(c=>c.id===scope.campaignId);if(!campaign||!['commercial','recruitment','other','unknown'].includes(scope.purpose)||!['whatsapp','page_whatsapp','website','form','video','unknown'].includes(scope.destination)||scope.connectionId&&!connections.some(c=>c.id===scope.connectionId)||scope.purpose==='commercial'&&!scope.connectionId||typeof scope.phoneConfirmed!=='boolean')throw fail('Confira campanha, finalidade, conexão e destino.');const phone=phoneDigits(scope.phone);if(phone&&!/^\d{8,20}$/.test(phone)||scope.phoneConfirmed&&!phone)throw fail('Informe o número conferido com país e DDD.');const since=scope.phoneConfirmed?(scope.phoneVerifiedFrom||today):null;if(since&&(!/^\d{4}-\d{2}-\d{2}$/.test(since)||!Number.isFinite(Date.parse(since))||new Date(since).toISOString().slice(0,10)!==since||since>today))throw fail('Informe uma data real de início do destino, até hoje.');if(isRecruitment(campaign.name)&&scope.purpose==='commercial')throw fail('Campanhas de recrutamento não podem entrar no CPL comercial.');clean.push({campaignId:campaign.id,name:String(campaign.name).slice(0,250),purpose:scope.purpose,connectionId:scope.connectionId||null,destination:scope.destination,phone:phone||null,phoneConfirmed:scope.phoneConfirmed,phoneVerifiedFrom:since});}
  await this.store.transaction(async tx=>{await tx.pool.query('UPDATE meta_ads_accounts SET campaign_scopes=$2,updated_at=now() WHERE company_id=$1',[user.company_id,JSON.stringify(clean)]);await tx.audit('meta_ads_scopes_updated',user.id,{companyId:user.company_id,campaigns:clean.length});});this.cache.clear();return this.settings(user);
 }
 async report(user,{from,to,connections=[]}){
  if(!canUseMetaDashboard(user))throw fail('Seu acesso não permite consultar o Dashboard Meta.',403);
  costPeriod(from,to,this.now());
  const restricted=user.role!=='admin',allowed=new Set(user.connections||[]);
  const all=(await this.registry.list()).filter(c=>c.companyId===user.company_id&&(!restricted||allowed.has(c.id)));
  const ids=connections.length?[...new Set(connections)]:all.map(c=>c.id);
  if(ids.some(id=>!all.some(c=>c.id===id)))throw fail('Conexão não encontrada ou sem acesso.',404);
  if(restricted&&!ids.length)throw fail('Seu usuário ainda não tem conexões autorizadas para o Dashboard Meta.',403);
  const row=await this.record(user.company_id),base={from,to,configured:!!row?.enabled,rows:[],daily:[],totals:null,complete:false,localTimezone:'America/Sao_Paulo',fetchedAt:new Date(this.now()).toISOString()};
  if(!row?.enabled)return {...base,status:'not_configured',notice:'Conecte uma conta de anúncios com ads_read para consultar investimento e custo por lead. Custos de WhatsApp continuam disponíveis separadamente.'};
  const key=JSON.stringify([user.company_id,row.updated_at,restricted,from,to,ids.sort()]),cached=this.cache.get(key);if(cached&&this.now()-cached.at<300000)return cached.value;if(this.pending.has(key))return this.pending.get(key);
  const work=(async()=>{try{const cfg=await this.connection(row.connection_id,user.company_id);if(row.access_token_cipher)cfg.accessToken=decryptSecret(row.access_token_cipher,this.config.connectionsKey);
   const account=await this.graph(cfg,row.account_id,{fields:'id,name,currency,timezone_name'});if(account.id!==row.account_id||!/^[A-Z]{3}$/.test(account.currency||'')||!account.timezone_name)throw fail('A Meta não confirmou a conta de anúncios.',502);
   let cursor=null,complete=true;const raw=[];const seen=new Set();for(let page=0;page<20;page++){const response=await this.graph(cfg,row.account_id+'/insights',{fields:'ad_id,ad_name,campaign_id,campaign_name,account_currency,spend,impressions,clicks,actions,date_start,date_stop',level:'ad',time_increment:1,time_range:{since:from,until:to},limit:500,...(cursor?{after:cursor}:{})});if(!Array.isArray(response.data))throw fail('Resposta incompleta de anúncios.',502);raw.push(...response.data);if(!response.paging?.next)break;const after=response.paging.cursors?.after;if(!after||seen.has(after)||page===19){complete=false;break;}seen.add(after);cursor=after;}
   // Local attribution is independent of Meta conversion attribution. Never infer an individual charge.
   const local=(await this.store.pool.query(`
    WITH linked AS (
      SELECT d.connection_id,d.phone,d.remote_id,d.reporting_snapshot,count(*) OVER (PARTITION BY d.remote_id) AS copies
      FROM crm_deals d JOIN whatsapp_connections c ON c.id=d.connection_id
      WHERE c.company_id=$1 AND d.state='linked' AND d.remote_id IS NOT NULL
    ), attributed AS (
      SELECT a.*,l.data,d.remote_id,d.reporting_snapshot AS sale,
        d.copies=1 AND (d.reporting_snapshot->>'verifiedAt')::timestamptz>=now()-interval '2 hours' AS verified
      FROM meta_ad_attribution a
      JOIN whatsapp_connections c ON c.id=a.connection_id
      LEFT JOIN leads l ON l.connection_id=a.connection_id AND l.phone=a.phone
      LEFT JOIN linked d ON d.connection_id=a.connection_id AND d.phone=a.phone
      WHERE c.company_id=$1 AND a.connection_id=ANY($2::text[])
        AND (a.occurred_at AT TIME ZONE $5)::date BETWEEN $3::date AND $4::date
    ), outcomes AS (
      SELECT *,verified AND sale->>'status'='won'
        AND (sale->>'finishedAt')::timestamptz>=occurred_at
        AND ((sale->>'finishedAt')::timestamptz AT TIME ZONE $5)::date<=$4::date AS won
      FROM attributed
    )
    SELECT a.source_id AS ad_id,a.connection_id,to_char(a.occurred_at AT TIME ZONE $5,'YYYY-MM-DD') AS day,
      count(*)::int AS contacts,
      count(*) FILTER(WHERE a.data->>'salesQualification'='qualified')::int AS qualified,
      count(*) FILTER(WHERE a.won)::int AS won,
      count(*) FILTER(WHERE a.verified)::int AS crm_verified,
      count(*) FILTER(WHERE a.remote_id IS NOT NULL)::int AS crm_linked,
      count(*) FILTER(WHERE a.verified AND a.sale->>'status'='won' AND a.sale->>'finishedAt' IS NULL)::int AS undated_won,
      count(*) FILTER(WHERE a.won AND a.sale->>'value' IS NULL)::int AS unpriced_won,
      coalesce(sum((a.sale->>'value')::numeric) FILTER(WHERE a.won),0)::float8 AS sold_value
    FROM outcomes a
    GROUP BY a.source_id,a.connection_id,to_char(a.occurred_at AT TIME ZONE $5,'YYYY-MM-DD')
   `,[user.company_id,ids,from,to,account.timezone_name])).rows;
   const ads=new Map(),days=new Map(),insightKeys=new Set();for(const item of raw){const insightKey=item.ad_id+':'+item.date_start;if(insightKeys.has(insightKey))throw fail('A Meta retornou indicadores duplicados; reduza o período e tente novamente.',502);insightKeys.add(insightKey);if(!/^\d+$/.test(item.ad_id||'')||item.account_currency!==account.currency||item.date_start<from||item.date_start>to)throw fail('A Meta retornou anúncio, moeda ou data incompatível.',502);const metrics=adMetrics(item),ad=ads.get(item.ad_id)||{id:item.ad_id,name:item.ad_name,campaign:item.campaign_name,campaignId:item.campaign_id,dailySpend:[],spend:0,impressions:0,clicks:0,conversations:0,metaLeads:0},day=days.get(item.date_start)||{day:item.date_start,spend:0,conversations:0,metaLeads:0};ad.dailySpend.push({day:item.date_start,spend:metrics.spend});for(const k of Object.keys(metrics))ad[k]+=metrics[k];for(const k of ['spend','conversations','metaLeads'])day[k]+=metrics[k];ads.set(item.ad_id,ad);days.set(day.day,day);}
   const scopes=row.campaign_scopes||[],classified=[...ads.values()].map(ad=>scopeAd({...ad,spend:round(ad.spend)},scopes,all,local));
   const cards=classified.filter(ad=>restricted?ad.purpose==='commercial'&&ids.includes(ad.connectionId):!ad.connectionId||ids.includes(ad.connectionId)).sort((a,b)=>b.spend-a.spend),commercial=cards.filter(ad=>ad.purpose==='commercial'&&ids.includes(ad.connectionId)),eligible=commercial.filter(ad=>ad.cplEligible),wa=commercial.filter(ad=>['whatsapp','page_whatsapp'].includes(ad.destination));
   const sum=(rows,key)=>round(rows.reduce((s,a)=>s+a[key],0)),totals={spend:sum(commercial,'spend'),conversations:sum(wa,'conversations'),metaLeads:sum(commercial,'metaLeads'),contacts:sum(commercial,'contacts'),qualified:sum(commercial,'qualified'),won:sum(commercial,'won'),impressions:sum(commercial,'impressions'),clicks:sum(commercial,'clicks'),whatsappSpend:sum(wa,'spend'),eligibleSpend:sum(eligible,'eligibleSpend'),eligibleContacts:sum(eligible,'eligibleContacts')};
   totals.costPerConversation=totals.conversations?round(totals.whatsappSpend/totals.conversations):null;totals.estimatedCostPerContact=totals.eligibleContacts?round(totals.eligibleSpend/totals.eligibleContacts):null;
   const accountTotals=restricted?null:{spend:sum(classified,'spend'),recruitmentSpend:sum(classified.filter(a=>a.purpose==='recruitment'),'spend'),unclassifiedSpend:sum(classified.filter(a=>a.purpose==='unknown'),'spend'),outsideScopeSpend:round(sum(classified,'spend')-totals.spend)};
   const scopedDays=new Map();for(const item of raw)if(commercial.some(a=>a.id===item.ad_id)){const m=adMetrics(item),d=scopedDays.get(item.date_start)||{day:item.date_start,spend:0,conversations:0,metaLeads:0};d.spend+=m.spend;if(wa.some(a=>a.id===item.ad_id))d.conversations+=m.conversations;d.metaLeads+=m.metaLeads;scopedDays.set(d.day,d);}
   const scopeReady=scopes.some(s=>s.purpose==='commercial'&&ids.includes(s.connectionId));
   const qualification=qualificationReport(cards,local,{from,to,currency:account.currency,complete});
   const value={...base,status:complete?'ok':'partial',qualification,complete,currency:account.currency,accountName:account.name,accountId:account.id,timezone:account.timezone_name,scopeReady,accountTotals,rows:cards,daily:[...scopedDays.values()].sort((a,b)=>a.day.localeCompare(b.day)),totals,unmatchedContacts:local.reduce((n,l)=>n+l.contacts,0)-totals.contacts,notice:'Investimento comercial somente das campanhas classificadas para as conexões selecionadas; recrutamento, outras finalidades e campanhas sem classificação ficam fora. Dias no fuso da conta de anúncios. Custo/conversa Meta usa apenas campanhas de WhatsApp. CPL local considera somente campanhas cujo número de destino foi conferido e coincide com a conexão; não é cobrança individual. O gasto e os contatos do CPL também respeitam a data desde a qual o número foi confirmado como destino; não se presume o destino histórico. Destinos de Página não são presumidos. O total da conta é mostrado separadamente e nunca dividido pelos leads comerciais. A qualificação reflete a situação atual e os ganhos são consultados no CRM; valores sujeitos a revisão, sem impostos/câmbio/taxas.'};this.cache.set(key,{at:this.now(),value});if(this.cache.size>30)this.cache.delete(this.cache.keys().next().value);return value;
  }catch(e){return {...base,status:'unavailable',error:e.status?e.message:'Não foi possível obter os indicadores. Confira conexão, permissões e disponibilidade da Meta.'};}})();this.pending.set(key,work);try{return await work;}finally{this.pending.delete(key);}
 }
}
