import crypto from 'node:crypto';
import {canSeeLead} from './conversation-access.js';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
export const DISCARD_REASONS=['Fora do perfil','Sem interesse','Produto não atendido','Região não atendida','Spam ou contato inválido','Outro'];
export function adReferral(message){
 const r=message?.referral;
 if(!r||r.source_type!=='ad'||typeof r.ctwa_clid!=='string'||!r.ctwa_clid.trim()||r.ctwa_clid.length>2048)return null;
 return {ctwa_clid:r.ctwa_clid,source_id:typeof r.source_id==='string'?r.source_id.slice(0,100):''};
}
export function conversionPayload({id,name,time,click,waba,value}){
 if(!['QualifiedLead','Purchase'].includes(name)||!click||!/^\d+$/.test(waba||''))throw fail('Evento sem identificação válida do anúncio.');
 if(name==='Purchase'&&(typeof value!=='number'||!Number.isFinite(value)||value<0))throw fail('Valor da venda inválido.');
 return {event_name:name,event_time:time,event_id:id,action_source:'business_messaging',messaging_channel:'whatsapp',user_data:{ctwa_clid:click,whatsapp_business_account_id:waba},...(name==='Purchase'?{custom_data:{currency:'BRL',value}}:{})};
}
export class MetaConversions{
 constructor(store,registry,{fetchImpl=fetch}={}){this.store=store;this.registry=registry;this.fetch=fetchImpl;this.running=null;}
 async init(){await this.store.pool.query("UPDATE meta_conversion_events SET status='uncertain',detail='Envio interrompido. Confira no Gerenciador de Eventos; não repetimos automaticamente.' WHERE status='sending'");}
 async settings(id){return (await this.store.pool.query('SELECT dataset_id,enabled FROM meta_conversion_settings WHERE connection_id=$1',[id])).rows[0]||{dataset_id:null,enabled:false};}
 async graph(c,path,body){
  const r=await this.fetch('https://graph.facebook.com/'+c.graphVersion+'/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+c.accessToken,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000),redirect:'error'});
  const data=await r.json();if(!r.ok)throw fail('A Meta recusou a operação (código '+(data.error?.code||r.status)+'). Confira a permissão whatsapp_business_manage_events e o conjunto de dados.',409);
  return data;
 }
 async configure(id,body,user){
  if(typeof body.enabled!=='boolean')throw fail('Configuração inválida.');
  if(!body.enabled){await this.store.transaction(async tx=>{await tx.pool.query('UPDATE meta_conversion_settings SET enabled=false,updated_at=now() WHERE connection_id=$1',[id]);await tx.pool.query("UPDATE meta_conversion_events SET status='cancelled',detail='Integração desativada antes do envio.' WHERE connection_id=$1 AND status='queued'",[id]);});return this.settings(id);}
  const c=await this.registry.configFor(id);
  let data=await this.graph(c,c.wabaId+'/dataset');
  if(!Array.isArray(data.data)||data.data.length>1||data.paging?.next)throw fail('Confira o conjunto de dados da conta WhatsApp na Meta.',409);
  let dataset=data.data[0]?.id;
  if(!dataset){await this.graph(c,c.wabaId+'/dataset',{dataset_name:'WhatsApp - '+c.connectionName});data=await this.graph(c,c.wabaId+'/dataset');if(Array.isArray(data.data)&&data.data.length===1&&!data.paging?.next)dataset=data.data[0]?.id;}
  if(!/^\d+$/.test(dataset||''))throw fail('A Meta não confirmou o conjunto de dados.',502);
  await this.store.pool.query('INSERT INTO meta_conversion_settings(connection_id,dataset_id,enabled) VALUES($1,$2,true) ON CONFLICT(connection_id) DO UPDATE SET dataset_id=excluded.dataset_id,enabled=true,updated_at=now()',[id,dataset]);
  await this.store.scope(id).audit('meta_conversions_enabled',user?.id||null,{datasetId:dataset});return this.settings(id);
 }
 async capture(id,message){
  const r=adReferral(message);if(!r)return;
  const timestamp=Number(message.timestamp),at=Number.isFinite(timestamp)&&timestamp>0&&timestamp<=Date.now()/1000+300?new Date(timestamp*1000):new Date();
  await this.store.pool.query(`INSERT INTO meta_ad_attribution(connection_id,phone,ctwa_clid,source_id,inbound_id,occurred_at) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(connection_id,phone) DO UPDATE SET ctwa_clid=excluded.ctwa_clid,source_id=excluded.source_id,inbound_id=excluded.inbound_id,occurred_at=excluded.occurred_at WHERE excluded.occurred_at>meta_ad_attribution.occurred_at AND excluded.inbound_id<>meta_ad_attribution.inbound_id`,[id,message.from,r.ctwa_clid,r.source_id,message.id,at]);
 }
 async contact(id,phone){
  const [attribution,events]=await Promise.all([this.store.pool.query('SELECT source_id,occurred_at FROM meta_ad_attribution WHERE connection_id=$1 AND phone=$2',[id,phone]),this.store.pool.query('SELECT event_name,status,detail,created_at,updated_at FROM meta_conversion_events WHERE connection_id=$1 AND phone=$2 ORDER BY created_at DESC LIMIT 10',[id,phone])]);
  return {attributed:!!attribution.rowCount,adId:attribution.rows[0]?.source_id||null,events:events.rows};
 }
 async queue(tx,id,phone,name,key,value,user){
  const settings=(await tx.pool.query('SELECT * FROM meta_conversion_settings WHERE connection_id=$1',[id])).rows[0];
  const ad=(await tx.pool.query('SELECT ctwa_clid FROM meta_ad_attribution WHERE connection_id=$1 AND phone=$2',[id,phone])).rows[0];
  const uuid=crypto.randomUUID(),time=Math.floor(Date.now()/1000),c=await this.registry.configFor(id);
  const detail=!settings?.enabled?'Integração Meta desativada.':!ad?'Contato sem identificação do clique no anúncio. Contatos antigos podem não ter esse dado.':null;
  const payload=detail?null:conversionPayload({id:uuid,name,time,click:ad.ctwa_clid,waba:c.wabaId,value});
  await tx.pool.query(`INSERT INTO meta_conversion_events(id,connection_id,phone,event_name,dedupe_key,event_time,payload,status,detail,dataset_id,user_id) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(connection_id,dedupe_key) DO UPDATE SET payload=excluded.payload,event_time=excluded.event_time,status=excluded.status,detail=excluded.detail,dataset_id=excluded.dataset_id,user_id=excluded.user_id,updated_at=now() WHERE meta_conversion_events.status IN ('skipped','cancelled','error')`,[uuid,id,phone,name,key,time,payload,detail?'skipped':'queued',detail,settings?.dataset_id||null,user?.id||null]);
 }
 async classify(id,phone,body,user){
  if(!['qualified','disqualified'].includes(body.status))throw fail('Classificação inválida.');
  const reason=typeof body.reason==='string'?body.reason.trim():'';
  if(body.status==='disqualified'&&(!DISCARD_REASONS.includes(reason)||typeof body.note!=='string'||body.note.length>500||reason==='Outro'&&!body.note.trim()))throw fail('Selecione o motivo do descarte. Em Outro, descreva o motivo (até 500 caracteres).');
  return this.store.scope(id).transaction(async tx=>{
   const lead=(await tx.pool.query('SELECT data FROM leads WHERE connection_id=$1 AND phone=$2 FOR UPDATE',[id,phone])).rows[0]?.data;
   if(!lead||!canSeeLead(user,lead))throw fail('Atendimento indisponível.',404);
   if(lead.resultado==='ganho')throw fail('Este contato já possui uma venda confirmada.',409);
   if(body.status==='qualified'&&lead.resultado==='perdido')throw fail('Reabra o atendimento antes de qualificá-lo.',409);
   const at=new Date().toISOString();
   const updated=await tx.updateLead(phone,{salesQualification:body.status,salesQualificationSource:'operator',salesQualificationReason:body.status==='disqualified'?reason:false,salesQualificationNote:body.status==='disqualified'?body.note.trim():false,salesQualifiedAt:at,salesQualifiedBy:user?.name||user?.email||'Gestor',...(body.status==='disqualified'?{resultado:'perdido'}:{})});
   if(body.status==='qualified')await this.queue(tx,id,phone,'QualifiedLead','qualified:'+phone,undefined,user);
   else await tx.pool.query("UPDATE meta_conversion_events SET status='cancelled',detail='Lead descartado antes do envio.' WHERE connection_id=$1 AND phone=$2 AND status='queued' AND event_name='QualifiedLead'",[id,phone]);
   await tx.audit('sales_qualification',user?.id||null,{phone,status:body.status,reason:reason||null});return updated;
  });
 }
 async businessCreated(tx,id,phone,dealId){
  const lead=await tx.getLead(phone);
  if(!lead||lead.optedOut||lead.salesQualification||['ganho','perdido'].includes(lead.resultado))return;
  await tx.updateLead(phone,{salesQualification:'qualified',salesQualificationSource:'crm',salesQualifiedAt:new Date().toISOString(),salesQualifiedBy:'Confirmação do CRM',salesQualificationDealId:dealId});
  await this.queue(tx,id,phone,'QualifiedLead','qualified:'+phone,undefined,null);
  await tx.audit('sales_qualification_from_crm',null,{phone,dealId,status:'qualified'});
 }
 async purchase(id,phone,user){
  return this.store.scope(id).transaction(async tx=>{
   const lead=(await tx.pool.query('SELECT data FROM leads WHERE connection_id=$1 AND phone=$2 FOR UPDATE',[id,phone])).rows[0]?.data;
   if(!lead||!canSeeLead(user,lead))throw fail('Atendimento indisponível.',404);
   const deal=(await tx.pool.query("SELECT remote_id,value FROM crm_deals WHERE connection_id=$1 AND phone=$2 AND remote_status='won' AND state='linked'",[id,phone])).rows[0];
   if(!deal?.remote_id||deal.value===null)throw fail('Confirme a venda e seu valor no negócio do CRM antes de enviar à Meta.',409);
   await this.queue(tx,id,phone,'Purchase','purchase:'+deal.remote_id,Number(deal.value),user);await tx.audit('meta_purchase_requested',user?.id||null,{phone,dealId:deal.remote_id});return {ok:true};
  });
 }
 tick(){if(this.running)return this.running;this.running=this.process().finally(()=>{this.running=null;});return this.running;}
 async process(){
  const rows=(await this.store.pool.query("SELECT id,connection_id,phone FROM meta_conversion_events WHERE status='queued' ORDER BY created_at LIMIT 10")).rows;
  for(const row of rows){
   const event=await this.store.transaction(async tx=>{
    await tx.pool.query('SELECT 1 FROM leads WHERE connection_id=$1 AND phone=$2 FOR UPDATE',[row.connection_id,row.phone]);
    const e=(await tx.pool.query("SELECT * FROM meta_conversion_events WHERE id=$1 AND status='queued' FOR UPDATE SKIP LOCKED",[row.id])).rows[0];if(!e)return null;
    const settings=await this.settings(e.connection_id);if(!settings.enabled||settings.dataset_id!==e.dataset_id||Date.now()/1000-e.event_time>7*86400){await tx.pool.query("UPDATE meta_conversion_events SET status='cancelled',detail='Configuração alterada ou evento com mais de 7 dias.' WHERE id=$1",[e.id]);return null;}
    await tx.pool.query("UPDATE meta_conversion_events SET status='sending',updated_at=now() WHERE id=$1",[e.id]);return e;
   });if(!event)continue;
   let status='uncertain',detail='Não foi possível confirmar o recebimento. Confira o Gerenciador de Eventos antes de qualquer nova tentativa.';
   try{
    const c=await this.registry.configFor(event.connection_id);
    if(c.wabaId!==event.payload?.user_data?.whatsapp_business_account_id){await this.store.pool.query("UPDATE meta_conversion_events SET status='cancelled',detail='A conta WhatsApp da conexão mudou antes do envio.',updated_at=now() WHERE id=$1",[event.id]);continue;}
    const response=await this.fetch('https://graph.facebook.com/'+c.graphVersion+'/'+event.dataset_id+'/events',{method:'POST',headers:{Authorization:'Bearer '+c.accessToken,'Content-Type':'application/json'},body:JSON.stringify({data:[event.payload]}),signal:AbortSignal.timeout(20000),redirect:'error'});
    const data=await response.json();
    if(response.ok&&data.events_received===1){status='sent';detail='Evento recebido pela Meta.';}
    else if(!response.ok&&response.status<500){status='error';detail='Meta recusou o evento (código '+(data.error?.code||response.status)+'). Confira permissões e configuração.';}
   }catch{/* Never repeat a conversion whose acceptance is unknown. */}
   await this.store.pool.query('UPDATE meta_conversion_events SET status=$2,detail=$3,updated_at=now() WHERE id=$1',[event.id,status,detail]);
  }
 }
}
