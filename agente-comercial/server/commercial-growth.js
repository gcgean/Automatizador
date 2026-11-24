import {LEAD_NURTURING_GUIDANCE} from './lead-nurturing.js';
import {commercialContent} from './commercial-page-content.js';
import {commercialPage} from './commercial-pages.js';
import crypto from 'node:crypto';
import {encryptSecret,decryptSecret} from './secrets.js';
import {PRODUCT_SEEDS,validateProduct,chooseProduct,productGaps} from './commercial-products.js';
import {can} from '../shared/access.js';
import {canSeeLead,visibilitySQL} from './conversation-access.js';
import {resolveAccess} from './access.js';
import {requestsOptOut,declinesInterest} from './consent.js';
import {clearNoResponseTag} from './conversation-lifecycle.js';

const APPROVED_OFFICIAL_PAGES={nfe:'https://commandweb.net/nota-fiscal-eletronica',nfse:'https://commandweb.net/nota-fiscal-de-servico',contador:'https://commandweb.net/contador',oficina:'https://commandweb.net/oficina'};
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const uuid=s=>/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(s||'');
export const PRODUCT_EVENTS=['signup_completed','trial_started','first_login','activation_completed','session_started','usage_error','subscription_started','trial_expired','subscription_cancelled'];
export const PRODUCT_LINK_TOOL={name:'obter_link_produto',description:'Obtém link individual de teste ou página comercial do produto nesta conexão. Use quando a necessidade do cliente já estiver entendida e for o momento de convidar a conhecer ou se cadastrar, ou quando o cliente pedir o link ou quiser testar agora. Não use na primeira resposta a um pedido genérico de informações.',strict:true,input_schema:{type:'object',additionalProperties:false,required:['produto'],properties:{produto:{type:['string','null'],description:'Identificador do catálogo atual, ou null para selecionar pelo interesse registrado.'}}}};
export function verifyProductSignature(raw,secret,timestamp,signature,now=Date.now()){
 if(!/^\d{10}$/.test(timestamp||'')||Math.abs(now-Number(timestamp)*1000)>300000||!/^sha256=[a-f0-9]{64}$/.test(signature||''))return false;
 const expected='sha256='+crypto.createHmac('sha256',secret).update(timestamp+'.').update(raw).digest('hex');
 return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(signature));
}
export function immediateSalesIntent(text){
 const s=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(/\b(?:ela|ele|cliente|pessoa) (?:disse|perguntou)\b/.test(s)||requestsOptOut(s)||declinesInterest(s)||/\b(?:nao|nunca)\b/.test(s)||/\b(?:amanha|depois|mais tarde|outro dia)\b/.test(s))return false;
 return /\b(?:ja )?pode(?:m)? (?:me )?ligar\b|\b(?:estou|to) disponivel\b|\b(?:quero|gostaria de|preciso|posso) (?:contratar|comprar|assinar|fechar|falar com (?:um |o |uma |a |alguem (?:do |da )?|o setor |a equipe |o time )?(?:vendedor|consultor|humano|pessoa|atendente|comercial|equipe comercial|vendas|alguem))\b|\b(?:podemos|vamos) (?:falar|conversar|fechar) agora\b/.test(s);
}
export function prefersProductTrial(text){
 const s=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(/\b(?:nao|nunca|agendamento|reagendamento|reuniao|apresentacao|demonstracao|ligacao|vendedor|humano|consultor)\b/.test(s)||/\b(?:agendar|reagendar|remarcar)\b/.test(s))return false;
 return /\b(?:testar|teste|experimentar|link|acessar o sistema|acesso ao sistema|conhecer o sistema|quero conhecer|como funciona|ver o sistema)\b/.test(s);
}
export class CommercialGrowth{
 constructor(store,config,{fetchImpl=fetch,now=()=>new Date()}={}){this.store=store;this.config=config;this.fetch=fetchImpl;this.now=now;}
 bind(registry){this.registry=registry;}
 async init(){
  const connections=(await this.store.pool.query('SELECT c.id,c.name,c.context_id,c.company_id,p.body FROM whatsapp_connections c LEFT JOIN context_profiles p ON p.id=c.context_id')).rows;
  // Apenas ofertas da operação proprietária; empresas clientes recebem catálogo próprio, vazio.
  for(const c of connections.filter(c=>c.company_id==='default'&&(c.context_id==='default'||c.context_id==='cilos-comercial'||c.body?.includes('Command Server')))){
   const family=c.context_id==='cilos-comercial'?'cilos':'command';
   for(const p of PRODUCT_SEEDS.filter(p=>p.family===family))await this.store.pool.query('INSERT INTO commercial_products(connection_id,id,data) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[c.id,p.id,{...p,enabled:true}]);
  }
 }
 async assertConnection(user,id){const c=await this.store.getConnection(id);if(!c||c.company_id!==user.company_id||user.role!=='admin'&&!user.connections.includes(id))throw fail('Conexão indisponível.',403);return c;}
 async instructions(id){return LEAD_NURTURING_GUIDANCE+'\nCATÁLOGO OPERACIONAL DE LINKS (somente desta conexão): '+JSON.stringify((await this.products(id)).filter(p=>p.enabled!==false).map(p=>({id:p.id,nome:p.name,testeConfirmado:p.trialConfirmed===true,cadastroPublicoConfirmado:p.officialSalesPage===true,condicoes:p.conditions,primeiroPasso:p.firstStep})))+'\nESTRATÉGIA ATUAL: ENTENDER, ESCLARECER E SÓ ENTÃO CONVIDAR (siga a CONDUÇÃO EM ETAPAS). Use obter_link_produto quando a necessidade estiver entendida e as dúvidas principais respondidas, ou na hora se o cliente pedir o link ou quiser testar já; envie o endereço com um benefício e o primeiro passo. Não conduza automaticamente para uma apresentação. Para cadastroPublicoConfirmado, envie a página oficial e siga o primeiroPasso e as condições específicos do produto, sem exigir liberação humana para abrir o cadastro. Não chame todo cadastro de gratuito: oficina pode apresentar contratação. Cadastro gratuito, quando indicado, não significa uso ou emissão grátis. Para os demais produtos, se o teste não estiver confirmado, apresente como página para conhecer e ofereça liberação pela equipe; não chame login ou página comercial de teste liberado. Depois que o cliente explorar, ofereça ajuda para começar e uma conversa de tira-dúvidas com vendedor, por aceite, se for útil. Não repita o link a cada mensagem nem condicione atendimento humano a testar antes. Cliente disponível agora, querendo comprar ou pedindo pessoa humana tem prioridade imediata. Pedido explícito de reunião pode ser agendado mesmo sem teste. Continue acompanhando o lead após o link, sem presumir cadastro ou uso por clique: confirme apenas eventos reais ou o que o cliente informou, distinguindo as fontes.';}
 async productLink(id,phone,input){const product=input?.produto?(await this.products(id)).find(p=>p.id===input.produto&&p.enabled!==false):await this.selection(id,phone);if(!product)return 'Produto ainda não identificado. Esclareça qual solução deseja conhecer, com uma pergunta curta.';const link=await this.makeLink(id,phone,product);if(!link)return 'Não foi possível gerar o link para este atendimento.';return JSON.stringify({produto:product.name,url:link.url,tipoLink:product.presentationEnabled?'pagina_produto':'destino_configurado',testeConfirmado:product.trialConfirmed===true,condicoes:product.conditions,cadastroPublicoConfirmado:product.officialSalesPage===true,primeiroPasso:product.trialConfirmed||product.officialSalesPage===true?product.firstStep:'A equipe precisa confirmar a liberação do teste.'});}
 landingUrl(id,product){return this.config.publicUrl+'/conhecer/'+encodeURIComponent(id)+'/'+product.id;}
 async publicPage(id,productId,ref,requestedFocus=''){
  const c=await this.store.getConnection(id),products=await this.products(id),product=products.find(p=>p.id===productId&&p.enabled!==false);if(!c?.enabled||!c.company_active||!product)throw fail('Página indisponível.',404);
  const curated=c.company_id==='default',content=commercialContent(product,curated);
  const origin=uuid(ref)?(await this.store.pool.query('SELECT phone FROM commercial_links WHERE id=$1 AND connection_id=$2 AND product_id=$3 AND expires_at>now()',[ref,id,product.id])).rows[0]:null;
  let focusId=content.focus.some(f=>f.id===requestedFocus)?requestedFocus:'';
  if(!focusId&&origin){
   const lead=await this.store.scope(id).getLead(origin.phone),normalize=text=>String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
   const need=normalize([lead?.dor_principal,lead?.produtos_interesse].filter(v=>typeof v==='string').join(' ').slice(0,1500));
   const found=content.focus.map(f=>({id:f.id,score:normalize(f.title).split(/\W+/).filter(w=>w.length>3&&need.includes(w)).length})).sort((a,b)=>b.score-a.score)[0];if(found?.score)focusId=found.id;
  }
  const related=[];
  if(['solucoes','erp'].includes(product.id))for(const p of products.filter(p=>p.enabled!==false&&p.id!==product.id&&p.id!=='solucoes')){
   const linked=origin?await this.makeLink(id,origin.phone,p):null;related.push({name:p.name,benefit:p.benefit,url:linked?.url||'/conhecer/'+encodeURIComponent(id)+'/'+p.id});
  }
  const demos=(await this.store.pool.query(`SELECT id,data->>'title' AS title,data->>'summary' AS summary,data->>'youtubeId' AS "youtubeId" FROM demonstration_videos WHERE connection_id=$1 AND (product_id=$2 OR data->'productIds' ? $2) AND published ORDER BY updated_at DESC LIMIT 3`,[id,product.id])).rows.map(d=>({...d,url:'/demonstracoes/'+d.id}));
  const company=(await this.store.pool.query('SELECT name FROM companies WHERE id=$1',[c.company_id])).rows[0];
  return commercialPage({product:{...product,family:product.family||PRODUCT_SEEDS.find(p=>p.id===product.id)?.family},companyName:curated?((product.family||PRODUCT_SEEDS.find(s=>s.id===product.id)?.family)==='cilos'?'Cilos':'Command System'):company.name,phone:String(c.display_phone||'').replace(/\D/g,''),ref:origin?ref:null,curated,focusId,related,demos,eventPath:'/conhecer/'+encodeURIComponent(id)+'/'+product.id+'/events'});
 }
 async publicPageEvent(id,productId,body){
  const types={view:'page_viewed',cta:'page_cta_clicked',focus:'page_focus_selected',faq:'page_faq_opened'},actions=['','trial','sales','contact','questions','steps','video','segment','faq'];
  if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['ref','sessionId','type','action','focus'].includes(k))||!uuid(body.ref)||!uuid(body.sessionId)||!Object.hasOwn(types,body.type)||!actions.includes(body.action)||typeof body.focus!=='string')throw fail('Evento de página inválido.');
  return this.store.transaction(async tx=>{
   await tx.pool.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['public-page:'+body.ref]);
   const row=(await tx.pool.query(`SELECT l.phone,p.data,c.company_id FROM commercial_links l JOIN commercial_products p ON p.connection_id=l.connection_id AND p.id=l.product_id JOIN whatsapp_connections c ON c.id=l.connection_id JOIN companies e ON e.id=c.company_id JOIN leads v ON v.connection_id=l.connection_id AND v.phone=l.phone WHERE l.id=$1 AND l.connection_id=$2 AND l.product_id=$3 AND l.expires_at>now() AND c.enabled AND e.active AND COALESCE(p.data->>'enabled','true')<>'false' AND COALESCE(v.data->>'optedOut','false')<>'true' AND COALESCE(v.data->>'cadenceDeclined','false')<>'true'`,[body.ref,id,productId])).rows[0];
   if(!row)return {ok:true,recorded:false};
   const content=commercialContent({...row.data,id:productId},row.company_id==='default');if(!content.focus.some(f=>f.id===body.focus))throw fail('Foco de página inválido.');
   const count=(await tx.pool.query("SELECT count(*)::int AS n FROM commercial_events WHERE connection_id=$1 AND phone=$2 AND product_id=$3 AND occurred_at>now()-interval '1 minute' AND kind IN ('page_viewed','page_cta_clicked','page_focus_selected','page_faq_opened')",[id,row.phone,productId])).rows[0].n;if(count>=30)return {ok:true,recorded:false};
   const eventId=['page',body.ref,body.sessionId,body.type,body.action,body.focus].join(':');
   const inserted=await tx.pool.query('INSERT INTO commercial_events(connection_id,phone,product_id,event_id,kind,occurred_at,data) VALUES($1,$2,$3,$4,$5,now(),$6) ON CONFLICT DO NOTHING RETURNING id',[id,row.phone,productId,eventId,types[body.type],{ref:body.ref,focus:body.focus,action:body.action}]);return {ok:true,recorded:!!inserted.rowCount};
  });
 }
 async products(id){return (await this.store.pool.query('SELECT p.id,p.data,p.version,p.updated_at,c.company_id,EXISTS(SELECT 1 FROM commercial_integrations i WHERE i.connection_id=p.connection_id AND i.product_id=p.id) AS integration_ready FROM commercial_products p JOIN whatsapp_connections c ON c.id=p.connection_id WHERE p.connection_id=$1 ORDER BY p.id',[id])).rows.map(r=>({...r.data,id:r.id,version:r.version,updatedAt:r.updated_at,integrationReady:r.integration_ready,officialSalesPage:r.company_id==='default'&&Object.hasOwn(APPROVED_OFFICIAL_PAGES,r.id)&&r.data.salesUrl===APPROVED_OFFICIAL_PAGES[r.id],presentationEnabled:r.company_id==='default'&&!(Object.hasOwn(APPROVED_OFFICIAL_PAGES,r.id)&&r.data.salesUrl===APPROVED_OFFICIAL_PAGES[r.id]),landingUrl:this.landingUrl(id,{id:r.id}),gaps:productGaps({...r.data,salesUrl:r.data.salesUrl||this.landingUrl(id,{id:r.id}),integrationReady:r.integration_ready})}));}
 async saveProduct(id,body,user){await this.assertConnection(user,id);if(user.role!=='admin')throw fail('Somente administradores alteram o catálogo.',403);let data;try{data=validateProduct(body);}catch(e){throw fail(e.message);}
  const result=await this.store.pool.query('INSERT INTO commercial_products(connection_id,id,data) VALUES($1,$2,$3) ON CONFLICT(connection_id,id) DO UPDATE SET data=excluded.data,version=commercial_products.version+1,updated_at=now() WHERE commercial_products.version=$4 RETURNING version',[id,data.id,data,body.version||0]);if(!result.rowCount)throw fail('O produto foi alterado. Atualize antes de salvar.',409);
  await this.store.scope(id).audit('commercial_product_saved',user.id,{productId:data.id,version:result.rows[0].version});return (await this.products(id)).find(p=>p.id===data.id);
 }
 async selection(id,phone,{strict=false}={}){const lead=await this.store.scope(id).getLead(phone);const tags=(await this.store.pool.query('SELECT t.name FROM lead_tags l JOIN contact_tags t ON t.connection_id=l.connection_id AND t.id=l.tag_id WHERE l.connection_id=$1 AND l.phone=$2',[id,phone])).rows.map(r=>r.name);const products=await this.products(id),matched=chooseProduct(products,lead,tags);if(matched)return matched;const recent=(await this.store.pool.query("SELECT product_id FROM commercial_events WHERE connection_id=$1 AND phone=$2 AND kind IN ('signup_completed','trial_started','activation_completed') ORDER BY occurred_at DESC LIMIT 1",[id,phone])).rows[0];return products.find(p=>p.enabled!==false&&p.id===recent?.product_id)||(strict?null:products.find(p=>p.enabled!==false&&p.id==='erp'))||(strict?null:products.find(p=>p.enabled!==false&&p.id==='solucoes'))||null;}
 async cadenceTemplate(id,phone,approved,events){
  const product=await this.selection(id,phone,{strict:true});if(!product)return null;
  const state=(await this.summary(id,phone)).find(p=>p.id===product.id);
  if(state?.subscribed_at&&(!state.cancelled_at||state.subscribed_at>state.cancelled_at))return {stop:true};
  if(state?.signup_at){const name=state.activation_at?'cadencia_avancar_contratacao_v1':'cadencia_primeiro_uso_v1';const template=approved.find(t=>t.name===name&&t.language==='pt_BR');if(!template)return null;const body=template.body.replace('{{1}}',product.name);if(events.some(e=>e.direction==='out'&&e.text===body))return null;return {...template,body,payload:{name,language:{code:'pt_BR'},components:[{type:'body',parameters:[{type:'text',text:product.name}]}]}};}
  if(!product.templateName)return null;
  if(events.some(e=>e.commercialProductId===product.id))return null;
  const previous=(await this.store.pool.query('SELECT id FROM commercial_links WHERE connection_id=$1 AND phone=$2 AND product_id=$3',[id,phone,product.id])).rows;
  if(previous.some(l=>events.some(e=>e.direction==='out'&&e.text?.includes('/t/'+l.id))))return null;
  const t=approved.find(t=>t.name===product.templateName&&t.language===(product.language||'pt_BR'));if(!t||!product.trialConfirmed&&/test(?:e|ar)|experiment|gratuit|gr[aá]tis/i.test(t.body))return null;
  if(t.body.includes('{{1}}')){
   const link=await this.makeLink(id,phone,product);if(!link)return null;
   return {...t,body:t.body.replace('{{1}}',link.url),commercialProductId:product.id,payload:{name:t.name,language:{code:t.language},components:[{type:'body',parameters:[{type:'text',text:link.url}]}]}};
  }
  if(!t.body.includes(product.trialConfirmed?product.trialUrl:product.salesUrl||this.landingUrl(id,product)))return null;
  return {...t,commercialProductId:product.id};
 }
 async makeLink(id,phone,product){
  if(!product||product.enabled===false)return null;
  const lead=await this.store.scope(id).getLead(phone);if(!lead||lead.optedOut||lead.cadenceDeclined||lead.conversationClosed||['ganho','perdido'].includes(lead.resultado))return null;
  const token=crypto.randomUUID();await this.store.pool.query('INSERT INTO commercial_links(id,connection_id,phone,product_id,destination) VALUES($1,$2,$3,$4,$5)',[token,id,phone,product.id,product.presentationEnabled?this.landingUrl(id,product):product.trialConfirmed?product.trialUrl:product.salesUrl||this.landingUrl(id,product)]);
  return {token,url:this.config.publicUrl+'/t/'+token};
 }
 async recordLinksSent(id,phone,text){
  const tokens=[...String(text||'').matchAll(/\/t\/([a-f0-9-]{36})/gi)].map(m=>m[1]);
  for(const token of tokens.filter(uuid))await this.store.pool.query("INSERT INTO commercial_events(connection_id,phone,product_id,event_id,kind,occurred_at) SELECT connection_id,phone,product_id,$4,'link_sent',now() FROM commercial_links WHERE id=$1 AND connection_id=$2 AND phone=$3 ON CONFLICT DO NOTHING",[token,id,phone,'sent:'+token]);
 }
 async redirect(token){
  if(!uuid(token))throw fail('Link inválido.',404);const row=(await this.store.pool.query('SELECT l.*,p.data,c.enabled,c.company_id,e.active FROM commercial_links l JOIN commercial_products p ON p.connection_id=l.connection_id AND p.id=l.product_id JOIN whatsapp_connections c ON c.id=l.connection_id JOIN companies e ON e.id=c.company_id WHERE l.id=$1 AND l.expires_at>now()',[token])).rows[0];
  if(!row||!row.enabled||!row.active||row.data.enabled===false||![this.landingUrl(row.connection_id,{id:row.product_id}),row.data.trialConfirmed?row.data.trialUrl:row.data.salesUrl].filter(Boolean).includes(row.destination))throw fail('Este link não está mais disponível.',410);
  // Visita observada, não prova de clique humano: verificadores de links também acessam URLs.
  await this.store.pool.query("INSERT INTO commercial_events(connection_id,phone,product_id,event_id,kind,occurred_at) VALUES($1,$2,$3,$4,'link_accessed',now()) ON CONFLICT DO NOTHING",[row.connection_id,row.phone,row.product_id,'access:'+token]);
  const official=row.company_id==='default'&&!row.data.trialConfirmed&&Object.hasOwn(APPROVED_OFFICIAL_PAGES,row.product_id)&&row.data.salesUrl===APPROVED_OFFICIAL_PAGES[row.product_id];const destination=new URL(official?row.data.salesUrl:row.destination);destination.searchParams.set('commercial_ref',token);return destination.href;
 }
 async rotateIntegration(id,productId,user){await this.assertConnection(user,id);if(user.role!=='admin')throw fail('Acesso restrito.',403);if(!(await this.products(id)).some(p=>p.id===productId))throw fail('Produto inexistente.',404);const secret=crypto.randomBytes(32).toString('hex');await this.store.pool.query('INSERT INTO commercial_integrations(connection_id,product_id,secret_cipher) VALUES($1,$2,$3) ON CONFLICT(connection_id,product_id) DO UPDATE SET secret_cipher=excluded.secret_cipher',[id,productId,encryptSecret(secret,this.config.connectionsKey)]);await this.store.scope(id).audit('commercial_integration_rotated',user.id,{productId});return {secret,url:this.config.publicUrl+'/product-events/'+encodeURIComponent(id)+'/'+productId};}
 async receiveEvent(id,productId,raw,headers){
  const c=await this.store.getConnection(id);if(!c?.enabled||!c.company_active)throw fail('Integração indisponível.',403);
  const integration=(await this.store.pool.query('SELECT secret_cipher FROM commercial_integrations WHERE connection_id=$1 AND product_id=$2',[id,productId])).rows[0];
  if(!integration||!verifyProductSignature(raw,decryptSecret(integration.secret_cipher,this.config.connectionsKey),headers['x-commercial-timestamp'],headers['x-commercial-signature'],this.now().getTime()))throw fail('Assinatura inválida.',401);
  let body;try{body=JSON.parse(raw);}catch{throw fail('JSON inválido.');}
  if(!body||typeof body!=='object'||Array.isArray(body)||!PRODUCT_EVENTS.includes(body.kind)||typeof body.eventId!=='string'||!/^[\w:.-]{1,120}$/.test(body.eventId)||typeof body.accountId!=='string'||!/^[\w:.-]{1,120}$/.test(body.accountId)||!Number.isFinite(Date.parse(body.occurredAt))||Date.parse(body.occurredAt)>this.now().getTime()+300000||Date.parse(body.occurredAt)<this.now().getTime()-90*86400000)throw fail('Confira evento, conta e data.');
  if(body.trialEndsAt&&(!Number.isFinite(Date.parse(body.trialEndsAt))||Date.parse(body.trialEndsAt)>this.now().getTime()+366*86400000))throw fail('Término de teste inválido.');
  return this.store.transaction(async tx=>{
   await tx.pool.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['product-account:'+id+':'+productId+':'+body.accountId]);
   const link=uuid(body.ref)?(await tx.pool.query('SELECT phone FROM commercial_links WHERE id=$1 AND connection_id=$2 AND product_id=$3 AND expires_at>now()',[body.ref,id,productId])).rows[0]:null;
   const account=(await tx.pool.query('SELECT phone FROM commercial_accounts WHERE connection_id=$1 AND product_id=$2 AND account_id=$3',[id,productId,body.accountId])).rows[0];
   if(account&&link&&account.phone!==link.phone)throw fail('Conta vinculada a outro contato.',409);const phone=account?.phone||link?.phone;if(!phone)throw fail('Envie a referência do link para vincular a conta.',422);
   const lead=(await tx.pool.query('SELECT data FROM leads WHERE connection_id=$1 AND phone=$2 FOR UPDATE',[id,phone])).rows[0]?.data;
   const prior=(await tx.pool.query('SELECT phone,kind,data FROM commercial_events WHERE connection_id=$1 AND product_id=$2 AND event_id=$3',[id,productId,body.eventId])).rows[0];
   if(prior&&(prior.phone!==phone||prior.kind!==body.kind||prior.data.accountId!==body.accountId))throw fail('Identificador de evento já usado para outro conteúdo.',409);
   await tx.pool.query('INSERT INTO commercial_accounts(connection_id,product_id,account_id,phone) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[id,productId,body.accountId,phone]);
   const data={accountId:body.accountId,...(body.trialEndsAt?{trialEndsAt:new Date(body.trialEndsAt).toISOString()}:{}),...(body.errorCode?{errorCode:String(body.errorCode).slice(0,80)}:{})};
   const inserted=await tx.pool.query('INSERT INTO commercial_events(connection_id,phone,product_id,event_id,kind,occurred_at,data) VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING id',[id,phone,productId,body.eventId,body.kind,body.occurredAt,data]);
   if(inserted.rowCount&&!lead.optedOut&&!lead.cadenceDeclined&&!['ganho','perdido'].includes(lead.resultado)&&['signup_completed','activation_completed','usage_error','subscription_started'].includes(body.kind)){
    if(lead.conversationClosed&&lead.conversationClosedReason==='cadence_no_response'){
     const scoped=tx.scope(id);await clearNoResponseTag(scoped,phone,lead);await scoped.updateLead(phone,{conversationClosed:false,conversationReopenedAt:this.now().toISOString(),conversationReopenedBy:'product_event',conversationClosedReasonNames:false});await scoped.audit('conversation_reopened_by_product',null,{phone,productId,eventId:body.eventId});
    }
    if(!lead.conversationClosed||lead.conversationClosedReason==='cadence_no_response'){
     const recipients=(await tx.pool.query("SELECT id FROM users WHERE company_id=$1 AND active AND ((id::text=$2) OR ($2::text IS NULL AND role='admin'))",[c.company_id,lead.assignedUserId||null])).rows;
     for(const u of recipients)await tx.pool.query("INSERT INTO user_notifications(id,user_id,company_id,connection_id,phone,kind) VALUES($1,$2,$3,$4,$5,'product_activity')",[crypto.randomUUID(),u.id,c.company_id,id,phone]);
    }
   }
   return {ok:true,duplicate:!inserted.rowCount};
  });
 }
 async summary(id,phone){
  const rows=(await this.store.pool.query(`SELECT p.id,p.data->>'name' AS name,max(e.occurred_at) AS last_activity,
   min(e.occurred_at) FILTER(WHERE kind='signup_completed') AS signup_at,min(e.occurred_at) FILTER(WHERE kind='activation_completed') AS activation_at,
   min(e.occurred_at) FILTER(WHERE kind='first_login') AS first_login_at,max(e.occurred_at) FILTER(WHERE kind='subscription_started') AS subscribed_at,
   max(e.occurred_at) FILTER(WHERE kind='subscription_cancelled') AS cancelled_at,max(e.data->>'trialEndsAt') AS trial_ends_at,
   count(*) FILTER(WHERE kind='session_started')::int AS sessions,max(e.occurred_at) FILTER(WHERE kind='usage_error') AS error_at
   FROM commercial_products p JOIN commercial_events e ON e.connection_id=p.connection_id AND e.product_id=p.id WHERE p.connection_id=$1 AND e.phone=$2 GROUP BY p.id,p.data->>'name'`,[id,phone])).rows;
  return rows.map(r=>({...r,stage:r.subscribed_at&&(!r.cancelled_at||r.subscribed_at>r.cancelled_at)?'Contratou':r.cancelled_at?'Cancelou':r.activation_at?'Ativou':r.first_login_at?'Primeiro acesso':r.signup_at?'Cadastrou':'Acesso ao link observado',nextAction:r.error_at&&(!r.activation_at||r.error_at>r.activation_at)?'Ajudar com dificuldade':r.subscribed_at&&(!r.cancelled_at||r.subscribed_at>r.cancelled_at)?'Implantação':r.activation_at?'Esclarecer dúvidas e contratação':r.signup_at?'Orientar primeiro uso':'Oferecer ajuda para começar'}));
 }
 async report(id,user){await this.assertConnection(user,id);const products=await this.products(id);const rows=(await this.store.pool.query(`SELECT l.phone,l.data,max(e.occurred_at) AS activity FROM leads l LEFT JOIN commercial_events e ON e.connection_id=l.connection_id AND e.phone=l.phone WHERE l.connection_id=$1 AND (e.id IS NOT NULL OR EXISTS(SELECT 1 FROM commercial_requests r WHERE r.connection_id=l.connection_id AND r.phone=l.phone AND r.status NOT IN ('responded','closed'))) GROUP BY l.phone,l.data ORDER BY activity DESC NULLS LAST LIMIT 100`,[id])).rows;
  const contacts=[];for(const r of rows){if(!canSeeLead(user,r.data))continue;const request=(await this.store.pool.query('SELECT * FROM commercial_requests WHERE connection_id=$1 AND phone=$2',[id,r.phone])).rows[0];contacts.push({phone:r.phone,name:r.data.nome||r.data.nomeWhatsApp||'Contato',owner:r.data.assignedUserName,request,products:await this.summary(id,r.phone)});}
  const metrics=(await this.store.pool.query(`SELECT e.product_id,
   count(DISTINCT e.phone) FILTER(WHERE e.kind='link_sent')::int AS links_sent,
   count(DISTINCT e.phone) FILTER(WHERE e.kind='link_accessed')::int AS link_accesses,
   count(DISTINCT e.phone) FILTER(WHERE e.kind='page_viewed')::int AS page_views,
   count(DISTINCT e.phone) FILTER(WHERE e.kind='page_cta_clicked')::int AS cta_clicks,
   count(DISTINCT e.phone) FILTER(WHERE e.kind='signup_completed')::int AS signups,
   count(DISTINCT e.phone) FILTER(WHERE e.kind='activation_completed')::int AS activations,
   count(DISTINCT e.phone) FILTER(WHERE e.kind='subscription_started')::int AS subscriptions
   FROM commercial_events e WHERE e.connection_id=$1 AND e.occurred_at>now()-interval '30 days' AND ($2::boolean OR ${visibilitySQL('e.connection_id','e.phone','$3')}) GROUP BY e.product_id`,[id,user.role==='admin',user.id])).rows;
  const responseMetrics=(await this.store.pool.query(`SELECT count(*) FILTER(WHERE r.status NOT IN ('responded','closed'))::int AS waiting,count(*) FILTER(WHERE r.alerted_at IS NOT NULL AND r.status NOT IN ('responded','closed'))::int AS overdue,round(avg(extract(epoch FROM (r.responded_at-r.requested_at))) FILTER(WHERE r.responded_at IS NOT NULL)) AS response_seconds FROM commercial_requests r WHERE r.connection_id=$1 AND r.requested_at>now()-interval '30 days' AND ($2::boolean OR ${visibilitySQL('r.connection_id','r.phone','$3')})`,[id,user.role==='admin',user.id])).rows[0];
  return {products,contacts,metrics,responseMetrics,limit:100};
 }
 async notifyManagers(tx,connectionId,phone){const c=await tx.getConnection(connectionId);const managers=(await tx.pool.query("SELECT id FROM users WHERE company_id=$1 AND active AND role='admin'",[c.company_id])).rows;for(const u of managers)await tx.pool.query("INSERT INTO user_notifications(id,user_id,company_id,connection_id,phone,kind) VALUES($1,$2,$3,$4,$5,'sales_priority')",[crypto.randomUUID(),u.id,c.company_id,connectionId,phone]);}
 async requestHuman(agent,phone,text){
  const id=agent.store.connectionId;
  await this.store.transaction(async tx=>{await tx.pool.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',['sales-request:'+id+':'+phone]);const current=(await tx.pool.query('SELECT * FROM commercial_requests WHERE connection_id=$1 AND phone=$2',[id,phone])).rows[0];if(current&&!['responded','closed'].includes(current.status))return;
   await tx.pool.query("INSERT INTO commercial_requests(connection_id,phone,reason) VALUES($1,$2,$3) ON CONFLICT(connection_id,phone) DO UPDATE SET requested_at=now(),reason=excluded.reason,status='waiting',assigned_at=NULL,assumed_at=NULL,responded_at=NULL,alerted_at=NULL",[id,phone,text.slice(0,500)]);await this.notifyManagers(tx,id,phone);
  });
  const assigned=await this.registry.routing.assignImmediate(agent,phone);
  if(assigned){await this.store.pool.query("UPDATE commercial_requests SET status='assigned',assigned_at=now() WHERE connection_id=$1 AND phone=$2",[id,phone]);return {reply:(assigned.name||'Um consultor')+' vai continuar seu atendimento por aqui.'};}
  await agent.store.updateLead(phone,{salesPriority:true,salesRequestedAt:this.now().toISOString()});
  const product=await this.selection(id,phone),link=await this.makeLink(id,phone,product);
  return {reply:'No momento não há um vendedor disponível para assumir. Seu pedido ficou sinalizado para a equipe.'+(link?(product.trialConfirmed?' Enquanto isso, você pode começar por aqui: ':' Enquanto isso, conheça a solução: ')+link.url+' '+(product.trialConfirmed?product.firstStep||'':''):' Continuo ajudando por aqui enquanto isso.')};
 }
 async assume(id,phone,user){await this.assertConnection(user,id);if(!can(user,'messages.send'))throw fail('Sem permissão para assumir.',403);const store=this.store.scope(id);return store.transaction(async tx=>{const r=await tx.pool.query('SELECT data FROM leads WHERE connection_id=$1 AND phone=$2 FOR UPDATE',[id,phone]);const lead=r.rows[0]?.data;if(!lead||!canSeeLead(user,lead)||lead.departmentId&&user.role!=='admin'&&!user.departmentIds?.includes(lead.departmentId)||lead.optedOut||lead.conversationClosed||['ganho','perdido'].includes(lead.resultado))throw fail('Atendimento indisponível.',403);if(lead.assignedUserId&&lead.assignedUserId!==user.id)throw fail('Outro vendedor já assumiu.',409);await tx.updateLead(phone,{status:'encaminhado',assignedUserId:user.id,assignedUserName:user.name||'Consultor',humanControlId:crypto.randomUUID()});await tx.pool.query("UPDATE commercial_requests SET status='assumed',assumed_at=COALESCE(assumed_at,now()) WHERE connection_id=$1 AND phone=$2 AND status NOT IN ('responded','closed')",[id,phone]);await tx.pool.query("UPDATE cadence_queue SET status='stopped',reason='Vendedor assumiu',updated_at=now() WHERE connection_id=$1 AND phone=$2",[id,phone]);await tx.audit('sales_request_assumed',user.id,{phone});return {ok:true};});}
 async humanReply(id,phone){await this.store.scope(id).updateLead(phone,{salesPriority:false});await this.store.pool.query("UPDATE commercial_requests SET status='responded',responded_at=COALESCE(responded_at,now()) WHERE connection_id=$1 AND phone=$2 AND status NOT IN ('responded','closed')",[id,phone]);}
 async telegramStatus(user){const row=(await this.store.pool.query('SELECT enabled,token_cipher IS NOT NULL AS configured FROM commercial_telegram WHERE company_id=$1',[user.company_id])).rows[0];return {...row,recipients:(await this.store.pool.query('SELECT r.user_id,u.name,r.manager FROM commercial_telegram_recipients r JOIN users u ON u.id=r.user_id WHERE r.company_id=$1',[user.company_id])).rows};}
 async saveTelegram(user,body){
  if(user.role!=='admin')throw fail('Somente administradores configuram o Telegram.',403);
  if(typeof body.enabled!=='boolean')throw fail('Configuração inválida.');
  let cipher=null;if(body.token){if(typeof body.token!=='string'||!/^\d{5,15}:[A-Za-z0-9_-]{30,80}$/.test(body.token))throw fail('Token de bot inválido.');cipher=encryptSecret(body.token,this.config.connectionsKey);}
  if(body.enabled&&!cipher&&!(await this.telegramStatus(user)).configured)throw fail('Configure o bot antes de ativar.');
  if(body.userId){if(!uuid(body.userId))throw fail('Usuário inválido.');if(!body.remove&&!/^-?\d{4,20}$/.test(body.chatId||''))throw fail('Chat ID inválido.');}
  await this.store.transaction(async tx=>{
   if(body.userId&&!(await tx.pool.query('SELECT id FROM users WHERE id=$1 AND company_id=$2 AND active FOR UPDATE',[body.userId,user.company_id])).rowCount)throw fail('Usuário indisponível.');
   await tx.pool.query('INSERT INTO commercial_telegram(company_id,enabled,token_cipher) VALUES($1,$2,$3) ON CONFLICT(company_id) DO UPDATE SET enabled=excluded.enabled,token_cipher=COALESCE(excluded.token_cipher,commercial_telegram.token_cipher),updated_at=now()',[user.company_id,body.enabled,cipher]);
   if(body.userId){if(body.remove)await tx.pool.query('DELETE FROM commercial_telegram_recipients WHERE company_id=$1 AND user_id=$2',[user.company_id,body.userId]);else await tx.pool.query('INSERT INTO commercial_telegram_recipients(company_id,user_id,chat_cipher,manager) VALUES($1,$2,$3,$4) ON CONFLICT(company_id,user_id) DO UPDATE SET chat_cipher=excluded.chat_cipher,manager=excluded.manager',[user.company_id,body.userId,encryptSecret(body.chatId,this.config.connectionsKey),body.manager===true]);}
   await tx.audit('commercial_telegram_configured',user.id,{companyId:user.company_id,enabled:body.enabled});
  });return this.telegramStatus(user);
 }
 async telegramTick(){
  // Claim persistente: em timeout, não repetir envio incerto automaticamente.
  const rows=(await this.store.pool.query(`SELECT n.*,t.token_cipher,r.chat_cipher FROM user_notifications n JOIN commercial_telegram t ON t.company_id=n.company_id AND t.enabled JOIN commercial_telegram_recipients r ON r.company_id=n.company_id AND r.user_id=n.user_id WHERE n.created_at>now()-interval '1 day' AND n.read_at IS NULL AND n.kind IN ('assignment','sales_priority','sales_overdue','product_activity','support_request','client_waiting','schedule_request') AND (n.kind IN ('assignment','product_activity','support_request','client_waiting','schedule_request') OR r.manager) AND NOT EXISTS(SELECT 1 FROM commercial_telegram_deliveries d WHERE d.notification_id=n.id AND d.user_id=n.user_id) ORDER BY n.created_at LIMIT 20`)).rows;
  for(const n of rows){const c=await this.store.getConnection(n.connection_id),u=(await this.store.pool.query('SELECT * FROM users WHERE id=$1 AND active AND company_id=$2',[n.user_id,n.company_id])).rows[0];if(!c?.enabled||!c.company_active||!u)continue;
   const user=await resolveAccess(this.store.pool,{...u,connections:(await this.store.pool.query('SELECT connection_id FROM user_connections WHERE user_id=$1',[u.id])).rows.map(r=>r.connection_id)}),lead=await this.store.scope(n.connection_id).getLead(n.phone);
   if(!lead||lead.optedOut||lead.conversationClosed||n.kind!=='support_request'&&['ganho','perdido'].includes(lead.resultado)||!can(user,'conversations.view')||user.role!=='admin'&&!user.connections.includes(n.connection_id)||!canSeeLead(user,lead))continue;
   const claim=await this.store.pool.query("INSERT INTO commercial_telegram_deliveries(notification_id,user_id,status) VALUES($1,$2,'sending') ON CONFLICT DO NOTHING RETURNING notification_id",[n.id,n.user_id]);if(!claim.rowCount)continue;
   try{const token=decryptSecret(n.token_cipher,this.config.connectionsKey),chat=decryptSecret(n.chat_cipher,this.config.connectionsKey),text=n.kind==='schedule_request'?'Um cliente pediu ou confirmou um horário. Abra o atendimento e confirme na agenda.':n.kind==='client_waiting'?'Um cliente está esperando resposta da equipe há mais de 2 horas. Abra o atendimento para responder.':n.kind==='support_request'?'Um cliente solicitou suporte técnico. Abra o atendimento para conferir o pedido.':n.kind==='product_activity'?'Há uma atualização de cadastro ou uso de um produto. Abra o atendimento para acompanhar.':n.kind==='sales_overdue'?'Um atendimento comercial ultrapassou o prazo. Abra o painel para conferir.':n.kind==='sales_priority'?'Um cliente pediu atendimento humano agora. Abra o painel para assumir.':'Um novo lead foi vinculado a você.';
    const response=await this.fetch('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:chat,text,reply_markup:{inline_keyboard:[[{text:'Abrir atendimento',url:this.config.publicUrl+'/?notification='+n.id}]]},protect_content:true}),signal:AbortSignal.timeout(10000)});const result=await response.json();await this.store.pool.query('UPDATE commercial_telegram_deliveries SET status=$3,updated_at=now() WHERE notification_id=$1 AND user_id=$2',[n.id,n.user_id,response.ok&&result.ok?'accepted':'failed']);
   }catch{await this.store.pool.query("UPDATE commercial_telegram_deliveries SET status='uncertain',updated_at=now() WHERE notification_id=$1 AND user_id=$2",[n.id,n.user_id]);}
  }
 }
 async sweep(){
  const rows=(await this.store.pool.query("SELECT r.*,l.data FROM commercial_requests r JOIN leads l ON l.connection_id=r.connection_id AND l.phone=r.phone WHERE r.status NOT IN ('responded','closed') ORDER BY r.requested_at LIMIT 100")).rows;
  for(const r of rows){const lead=r.data,c=await this.store.getConnection(r.connection_id);if(!c?.enabled||!c.company_active||lead.optedOut||lead.cadenceDeclined||lead.conversationClosed||['ganho','perdido'].includes(lead.resultado)){await this.store.pool.query("UPDATE commercial_requests SET status='closed' WHERE connection_id=$1 AND phone=$2",[r.connection_id,r.phone]);continue;}
   if(r.status==='waiting'&&!lead.assignedUserId){const runtime=await this.registry.runtime(r.connection_id);const assigned=await this.registry.routing.assignImmediate(runtime.agent,r.phone);if(assigned)await this.store.pool.query("UPDATE commercial_requests SET status='assigned',assigned_at=now() WHERE connection_id=$1 AND phone=$2 AND status='waiting'",[r.connection_id,r.phone]);}
   const age=this.now()-new Date(r.requested_at),deadline=r.assumed_at?180000:60000;
   if(age>deadline&&!r.alerted_at)await this.store.transaction(async tx=>{const changed=await tx.pool.query('UPDATE commercial_requests SET alerted_at=now() WHERE connection_id=$1 AND phone=$2 AND alerted_at IS NULL AND status NOT IN (\'responded\',\'closed\') RETURNING phone',[r.connection_id,r.phone]);if(changed.rowCount){const managers=(await tx.pool.query("SELECT id FROM users WHERE company_id=$1 AND active AND role='admin'",[c.company_id])).rows;for(const u of managers)await tx.pool.query("INSERT INTO user_notifications(id,user_id,company_id,connection_id,phone,kind) VALUES($1,$2,$3,$4,$5,'sales_overdue')",[crypto.randomUUID(),u.id,c.company_id,r.connection_id,r.phone]);}});
  }
 }
 tick(){if(this.running)return this.running;this.running=(async()=>{await this.sweep();await this.telegramTick();})().finally(()=>{this.running=null;});return this.running;}
}
