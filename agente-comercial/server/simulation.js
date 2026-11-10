import crypto from 'node:crypto';
import {PgStore} from './pg-store.js';
import {AgendaService,AGENDA_BASE} from './agenda.js';
import {CrmService} from './crm.js';
import {SalesAgent} from './agent.js';
const PHONE='5500000000000';
const failure=(message,status=400)=>Object.assign(new Error(message),{status});
// Each test session has its own schema and simulated transports. No production writes.
export class SimulationService{
 constructor(store,config,{providerFactory,agendaFetch=fetch,crmFetch=fetch}={}){this.crmFetch=crmFetch;this.testCrmWorkers=new Map();this.agendaFetch=agendaFetch;this.root=store;this.config=config;this.providerFactory=providerFactory;this.sessions=new Map();this.timer=setInterval(()=>this.expire().catch(()=>{}),60000);this.timer.unref();}
 async init(){if((await this.root.pool.query("SELECT 1 FROM pg_namespace WHERE nspname='iara_agenda_tests'")).rowCount)await this.realStore();const {rows}=await this.root.pool.query("SELECT nspname FROM pg_namespace WHERE nspname ~ '^sim_iara_[a-f0-9]{32}$'");for(const {nspname} of rows)await this.root.pool.query('DROP SCHEMA "'+nspname+'" CASCADE');}
 async expire(){for(const [id,s] of this.sessions)if(!s.busy&&Date.now()-s.at>1800000)await this.remove(id);}
 async remove(id){const s=this.sessions.get(id);if(!s)return;this.sessions.delete(id);await s.crm?.close();if(s.real)return;await s.db.close();if(!/^sim_iara_[a-f0-9]{32}$/.test(s.schema))throw failure('Schema inválido');await this.root.pool.query('DROP SCHEMA "'+s.schema+'" CASCADE');}
 async close(){clearInterval(this.timer);for(const id of [...this.sessions.keys()])await this.remove(id);for(const worker of this.testCrmWorkers.values())await worker.close();await this.realDb?.close();}
 async start(connectionId,userId,options={}){
  this.validateCrm(options);
  if(options.mode!==undefined&&!['simulated','real'].includes(options.mode))throw failure('Modo de teste inválido.');
  if(options.mode==='real')return this.startReal(connectionId,userId,options);
  await this.expire();for(const [id,s] of this.sessions)if(s.userId===userId&&!s.busy)await this.remove(id);
  if(this.sessions.size>=4)throw failure('Há quatro testes em andamento. Aguarde ou encerre uma sessão.',429);
  const original=await this.root.getConnection(connectionId),sourceAgenda=new AgendaService(this.root,this.config),settings=await sourceAgenda.settings(connectionId);
  const id=crypto.randomUUID(),schema='sim_iara_'+id.replaceAll('-','');await this.root.pool.query('CREATE SCHEMA "'+schema+'"');
  const url=new URL(this.config.databaseUrl);url.searchParams.set('options','-c search_path='+schema);const db=new PgStore(url.toString(),'.');
  const s={id,schema,db,userId,connectionId,at:Date.now(),busy:true,turns:0,contextName:original.contextName,provider:original.provider,productionAgendaEnabled:settings.enabled};this.sessions.set(id,s);
  try{
   await db.init();await db.saveContext('sandbox',original.contextName||'Contexto de teste',original.contextBody);await db.pool.query("UPDATE whatsapp_connections SET context_id='sandbox',provider=$1,enabled=true WHERE id='default'",[original.provider]);
   const tech=settings.technician_ids?.[0]||1,procedure=settings.procedure_id||1;let remote=1000;const reservations=new Map();
   const fakeFetch=async(url,options)=>{if(!url.startsWith(AGENDA_BASE+'/'))throw failure('Transporte externo bloqueado');const path=url.slice(AGENDA_BASE.length).split('?')[0],q=new URL(url).searchParams;let data,status=200;
    if(path==='/procedimentos')data=[{id:procedure,nome:'Procedimento simulado',duracaoMin:60,tecnicoIds:[tech]}];
    else if(path==='/tecnicos')data=[{id:tech,nome:'Apresentador de teste'}];
    else if(path==='/horarios'){const from=q.get('dataInicio'),to=q.get('dataFim'),days=[];for(let d=Date.parse(from+'T12:00Z');d<=Date.parse(to+'T12:00Z');d+=86400000)days.push({data:new Date(d).toISOString().slice(0,10),tecnicoId:tech,tecnicoNome:'Apresentador de teste',horarios:['09:00','10:00','14:00','15:00']});data={duracaoMin:60,disponibilidade:days};}
    else if(path==='/agendamentos'&&options.method==='POST'){const body=JSON.parse(options.body);data={...body,id:++remote,duracaoMin:60,status:'ativo'};reservations.set(data.id,data);status=201;}
    else if(/^\/agendamentos\/\d+$/.test(path)&&options.method==='GET'){data=reservations.get(Number(path.split('/').at(-1)));if(!data){data={error:'Agendamento simulado não encontrado.'};status=404;}}
    else throw failure('Operação não permitida no simulador');return {ok:true,status,json:async()=>data};
   };
   const agenda=new AgendaService(db,{...this.config,agendaApiKey:'ca_'+'a'.repeat(48)},{fetchImpl:fakeFetch});await agenda.save('default',{enabled:true,procedure_id:procedure,technician_ids:[tech],horizon_days:7,max_options:3,weekdays:[1,2,3,4,5],start_time:'08:00',end_time:'18:00'},null);
   const scoped=db.scope('default'),whatsapp={markRead:async()=>{},sendText:async(to,text,meta)=>{if(to!==PHONE)throw failure('Destino externo bloqueado');await scoped.recordEvent({id:crypto.randomUUID(),phone:to,text,direction:'out',...meta,state:'simulated'});return {messages:[{id:crypto.randomUUID()}]};}};
   await this.attachCrm(s,scoped,options);
   s.agent=new SalesAgent({config:{...this.config,sellerNumbers:[]},store:scoped,whatsapp,agenda,crm:s.crm,providerFactory:this.providerFactory,log:{error:()=>{},warn:()=>{}}});s.busy=false;
   return {...await this.snapshot(s),contextName:original.contextName,provider:original.provider,productionAgendaEnabled:settings.enabled};
  }catch(e){s.busy=false;await this.remove(id);throw e;}
 }
 async realStore(){
  if(this.realDb)return this.realDb;if(this.realCreating)return this.realCreating;
  this.realCreating=(async()=>{await this.root.pool.query('CREATE SCHEMA IF NOT EXISTS iara_agenda_tests');const url=new URL(this.config.databaseUrl);url.searchParams.set('options','-c search_path=iara_agenda_tests');const db=new PgStore(url.toString(),'.');try{await db.init();await db.pool.query('CREATE TABLE IF NOT EXISTS test_sessions(id text PRIMARY KEY,connection_id text NOT NULL,user_id text NOT NULL,created_at timestamptz NOT NULL DEFAULT now())');await new AgendaService(db,this.config).init();this.realDb=db;const {rows}=await db.pool.query("SELECT id,connection_id FROM test_sessions WHERE id LIKE 'crm-test-%'");for(const row of rows)await this.crmWorker(db,row.id,row.connection_id);return db;}catch(e){await db.close();throw e;}})();try{return await this.realCreating;}finally{this.realCreating=null;}
 }
 async realBookings(connectionId){const exists=(await this.root.pool.query("SELECT 1 FROM pg_namespace WHERE nspname='iara_agenda_tests'")).rowCount;if(!exists)return [];const db=await this.realStore();return (await db.pool.query('SELECT b.id,b.connection_id AS session_id,b.option_data,b.status,b.remote_id,b.error,b.created_at FROM agenda_bookings b JOIN test_sessions s ON s.id=b.connection_id WHERE s.connection_id=$1 ORDER BY b.created_at DESC LIMIT 100',[connectionId])).rows;}
 async reviewReal(connectionId,bookingId,body,userId){const db=await this.realStore();const {rows:[row]}=await db.pool.query('SELECT b.connection_id FROM agenda_bookings b JOIN test_sessions s ON s.id=b.connection_id WHERE b.id=$1 AND s.connection_id=$2',[bookingId,connectionId]);if(!row)throw failure('Solicitação não encontrada.',404);return new AgendaService(db,this.config,{fetchImpl:this.agendaFetch}).review(row.connection_id,bookingId,body,null);}
 async startReal(connectionId,userId,options){
  this.validateCrm(options);
  if(options.acceptRealBooking!==true)throw failure('Confirme que este modo cria reservas reais na agenda.');
  await this.expire();for(const [id,s] of this.sessions)if(s.userId===userId&&!s.busy)await this.remove(id);
  if(this.sessions.size>=4)throw failure('Há quatro testes em andamento. Aguarde.',429);
  const source=new AgendaService(this.root,this.config),settings=await source.settings(connectionId),original=await this.root.getConnection(connectionId);
  if(!settings.enabled||!settings.procedure_id||!settings.technician_ids.length)throw failure('Ative e configure a agenda desta conexão primeiro.');
  const db=await this.realStore();if((await this.realBookings(connectionId)).some(b=>['sending','uncertain'].includes(b.status)))throw failure('Existe um teste real aguardando conferência. Confira o registro antes de iniciar outro.',409);
  const id=crypto.randomUUID(),context=await db.saveContext('context-'+id,original.contextName||'Contexto de teste',original.contextBody);
  await db.pool.query('INSERT INTO whatsapp_connections(id,name,context_id,provider,enabled) VALUES($1,$2,$3,$4,true)',[id,'Teste real do painel',context.id,original.provider]);await db.pool.query('INSERT INTO test_sessions(id,connection_id,user_id) VALUES($1,$2,$3)',[id,connectionId,userId]);
  const liveFetch=async(url,request)=>{if(request.method==='POST'){const current=await source.settings(connectionId);if(!current.enabled||current.version!==settings.version) return {ok:false,status:409,json:async()=>({error:'Configuração mudou. Reinicie o teste real.'})};const body=JSON.parse(request.body);body.descricao='[TESTE REAL DO PAINEL] '+body.descricao;request={...request,body:JSON.stringify(body)};}return this.agendaFetch(url,request);};
  const agenda=new AgendaService(db,this.config,{fetchImpl:liveFetch});await agenda.save(id,{...settings,apiKey:source.key(settings)},null);
  const scoped=db.scope(id);await scoped.updateLead(PHONE,{nome:'TESTE REAL DO PAINEL',observacoes:'Agendamento real criado pelo teste interno. Nenhum WhatsApp enviado.'});
  const whatsapp={markRead:async()=>{},sendText:async(to,text,meta)=>{if(to!==PHONE)throw failure('Destino externo bloqueado');await scoped.recordEvent({id:crypto.randomUUID(),phone:to,text,direction:'out',...meta,state:'internal-test'});return {messages:[{id:crypto.randomUUID()}]};}};
  const s={id,db,real:true,userId,connectionId,at:Date.now(),busy:false,turns:0,contextName:original.contextName,provider:original.provider,productionAgendaEnabled:true};await this.attachCrm(s,scoped,options);s.agent=new SalesAgent({config:{...this.config,sellerNumbers:[]},store:scoped,whatsapp,agenda,crm:s.crm,providerFactory:this.providerFactory,log:{error:()=>{},warn:()=>{}}});this.sessions.set(id,s);return this.snapshot(s);
 }
 validateCrm(options){if(options.crmMode!==undefined&&!['simulated','real'].includes(options.crmMode))throw failure('Modo de CRM inválido.');if(options.crmMode==='real'){if(options.acceptRealCrm!==true)throw failure('Confirme que este teste cria cadastro real no CRM.');const digits=String(options.crmPhone||'').replace(/\D/g,'');if(!/^(55)?[1-9][0-9]{9,10}$/.test(digits))throw failure('Informe um WhatsApp brasileiro válido para identificar o lead de teste.');}}
 async attachCrm(s,scoped,options){s.crmMode=options.crmMode||'simulated';s.crmPhone=String(options.crmPhone||'').replace(/\D/g,'');if(s.crmPhone.length===10||s.crmPhone.length===11)s.crmPhone='55'+s.crmPhone;if(s.crmMode==='real'){const source=new CrmService(this.root,this.config);if(!await source.enabled(s.connectionId))throw failure('Ative o CRM desta conexão antes do teste real.');}
  const key=scoped.connectionId;let business=null;
  const mock=async(url,request)=>{const path=new URL(url).pathname.split('/v1')[1];let data;
   if(path==='/funis')data=[{id:1,nome:'Sistema simulado',ativo:true}];else if(path==='/etapas')data=[{id:3,nome:'Contato feito simulado',ativo:true,funilIds:[1],camposAdicionais:[]}];else if(path==='/vendedores')data=[{id:508,name:'Responsável simulado'}];
   else if(path==='/negocios'&&request.method==='POST'){business={...JSON.parse(request.body),id:900001,value:0};data=business;}
   else if(path?.startsWith('/negocios/cliente/'))data=business?[business]:[];
   else if(path?.startsWith('/negocios/')){if(request.method==='PUT')Object.assign(business,JSON.parse(request.body));data=business;}
   else {const payload=JSON.parse(request.body);data={success:true,action:'updated',lead:{...payload,id:900000},warnings:[]};}
   return {ok:true,status:200,json:async()=>data};};
  s.acceptRealDeal=options.acceptRealDeal===true;
  s.crm=new CrmService(s.db,{...this.config,crmToken:'simulated-crm-token',crmSuppressMarker:s.crmMode==='real'},{connectionId:key,fetchImpl:mock});await s.crm.save(key,{enabled:true,canal:'WhatsApp',segmento:'',token:'simulated-crm-token'},null);
  if(s.crmMode!=='real')await s.crm.deals.save(key,{enabled:true,funil_id:1,stage_id:3,user_id:508},null);}

 async crmWorker(db,id,originalId){if(this.testCrmWorkers.has(id))return this.testCrmWorkers.get(id);const source=new CrmService(this.root,this.config);const worker=new CrmService(db,{...this.config,crmTest:true},{connectionId:id,fetchImpl:async(url,request)=>{const settings=await source.settings(originalId);if(!settings.enabled||!source.token(settings))throw Object.assign(new Error('CRM de origem desativado.'),{status:403,retryable:false});return this.crmFetch(url,{...request,headers:{...request.headers,Authorization:'Bearer '+source.token(settings)}});}});await worker.init();this.testCrmWorkers.set(id,worker);worker.start();return worker;}
 async testCrmRecords(connectionId){if(!(await this.root.pool.query("SELECT 1 FROM pg_namespace WHERE nspname='iara_agenda_tests'")).rowCount)return [];const db=await this.realStore();const id='crm-test-'+crypto.createHash('sha256').update(connectionId).digest('hex').slice(0,24);return new CrmService(db,this.config).list(id);}
 async retryTestCrm(connectionId,phone,userId){const db=await this.realStore(),id='crm-test-'+crypto.createHash('sha256').update(connectionId).digest('hex').slice(0,24);if(!(await db.pool.query('SELECT 1 FROM test_sessions WHERE id=$1 AND connection_id=$2',[id,connectionId])).rowCount)throw failure('Teste de CRM não encontrado.',404);const worker=await this.crmWorker(db,id,connectionId);await worker.retry(id,phone,null);await worker.tick();return {ok:true};}
 async syncTestCrm(s){const scoped=s.real?s.db.scope(s.id):s.db.scope('default'),lead=await scoped.getLead(PHONE);if(!lead||lead.optedOut||!lead.crmEngaged&&lead.resultado!=='apresentacao_agendada')return;
  const db=await this.realStore(),id='crm-test-'+crypto.createHash('sha256').update(s.connectionId).digest('hex').slice(0,24);await db.pool.query("INSERT INTO whatsapp_connections(id,name,enabled) VALUES($1,'CRM - testes reais',true) ON CONFLICT DO NOTHING",[id]);await db.pool.query('INSERT INTO test_sessions(id,connection_id,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[id,s.connectionId,s.userId]);const source=new CrmService(this.root,this.config),settings=await source.settings(s.connectionId);if(!settings.enabled)throw failure('CRM desativado. Nenhum cadastro real enviado.');const worker=await this.crmWorker(db,id,s.connectionId);await worker.save(id,{enabled:true,canal:settings.canal,segmento:settings.segmento,token:source.token(settings)},null);if(s.acceptRealDeal){const d=await source.deals.settings(s.connectionId);if(!d.enabled)throw failure('Ative a criação de negócios desta conexão antes do teste real.');await worker.deals.save(id,{enabled:true,funil_id:d.funil_id,stage_id:d.stage_id,user_id:d.user_id},null);}else{await worker.deals.save(id,{enabled:false,funil_id:null,stage_id:null,user_id:null},null);}
  const target=db.scope(id),fields=['nome','nomeWhatsApp','empresa','cidade','segmento','email','produtos_interesse','temperatura','resumoParaVendedor','dor_principal','crmEngaged','crmEngagedReason','resultado','agendamentoResumo'];await target.updateLead(s.crmPhone,Object.fromEntries(fields.filter(k=>lead[k]!==undefined).map(k=>[k,lead[k]])));
  for(const event of await scoped.getEvents(PHONE))if(event.kind!=='crm')await target.recordEvent({...event,id:s.id+'-'+event.id,phone:s.crmPhone});await worker.enqueue(id,s.crmPhone);await worker.tick();await worker.tick();s.crmResult=(await worker.list(id)).find(r=>r.phone===s.crmPhone)||null;if(s.crmResult?.remote_id){await scoped.updateLead(PHONE,{crmId:s.crmResult.remote_id});await scoped.recordEvent({id:'crm-real-'+s.crmResult.remote_id,phone:PHONE,direction:'out',actor:'system',kind:'crm',text:'Lead de teste cadastrado no CRM real · #'+s.crmResult.remote_id,state:'internal'});}}
 async state(id,connectionId,userId){const s=this.sessions.get(id);if(!s||s.connectionId!==connectionId||s.userId!==userId)throw failure('Teste expirado.',404);return this.snapshot(s);}
 async snapshot(s){if(s.crmMode==='real')s.crmResult=(await this.testCrmRecords(s.connectionId)).find(r=>r.phone===s.crmPhone)||null;const db=s.real?s.db.scope(s.id):s.db;return {sessionId:s.id,simulation:!s.real,mode:s.real?'real':'simulated',contextName:s.contextName,provider:s.provider,productionAgendaEnabled:s.productionAgendaEnabled,crmMode:s.crmMode||'simulated',crm:s.crmMode==='real'?s.crmResult:(s.crm?((await s.crm.list(s.real?s.id:'default'))[0]||null):null),events:await db.getEvents(PHONE),lead:(await db.listLeads())[PHONE]||null,bookings:await new AgendaService(s.db,this.config).bookings(s.real?s.id:'default'),expiresInMinutes:30};}
 async message(id,connectionId,userId,text){const s=this.sessions.get(id);if(!s||s.userId!==userId||s.connectionId!==connectionId)throw failure('Teste expirado. Inicie um novo teste.',404);if(s.busy)throw failure('Aguarde a resposta anterior.',409);if(typeof text!=='string'||!text.trim()||text.length>4000)throw failure('Digite uma mensagem de até 4.000 caracteres.');if(s.turns>=60)throw failure('Limite de 60 mensagens. Inicie outro teste.');s.busy=true;s.at=Date.now();try{s.turns++;await s.agent.enqueue({id:crypto.randomUUID(),from:PHONE,name:'Lead de teste',text:text.trim()});await s.crm?.tick();if(s.crmMode==='real')await this.syncTestCrm(s);return await this.snapshot(s);}finally{s.busy=false;}}
}
