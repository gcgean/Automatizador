import crypto from 'node:crypto';
import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {loadConfig, assertReady, loadDotEnv} from './config.js';
import {Store} from './store.js';
import {PgStore} from './pg-store.js';
import {PasswordAuth} from './auth.js';
import {AccessGroups,resolveAccess} from './access.js';
import {can,requiredPermission,PERMISSION_SECTIONS} from '../shared/access.js';
import {UserAdministration} from './users.js';
import {ConnectionRegistry} from './connections.js';
import {LearningService} from './learning.js';
import {evaluateLead} from './qualification.js';
import {ConversationAccess} from './conversation-access.js';
import {TagService} from './tags.js';
import {CallingService} from './calling.js';
import {MediaService} from './media.js';
import {CadenceService} from './cadence.js';
import {CrmService} from './crm.js';
import {SimulationService} from './simulation.js';
import {AgendaService} from './agenda.js';
import {WhatsAppClient, verifySignature, extractMessages, extractStatuses} from './whatsapp.js';
import {SalesAgent} from './agent.js';
import {PROVIDERS, providerSettings} from './llm.js';

import {servePanel} from './panel.js';
import {DurableInbox} from './inbox.js';

const MAX_BODY = 1024 * 1024;

export function createApp({config, agent, store:rootStore, inbox:baseInbox, auth, registry, learning, agenda, simulation, crm, cadence, media, calling, log = console}) {
  const users=auth?new UserAdministration(rootStore,config.publicUrl):null;
  return async function handler(req, res) {
    let store=rootStore,inbox=baseInbox,access=null,tags=null;
    const url = new URL(req.url, 'http://localhost');
    try {
      res.setHeader('Cache-Control', 'no-store');
      if (await servePanel(req, res, url.pathname)) return;
      if (auth && await auth.handle(req,res,url,readBody,send)) return;
      if (req.method === 'GET' && url.pathname === '/health') {
        await store.health?.();
        return send(res, 200, {ok: true, mode: config.panelOnly ? 'setup' : 'live', storage: config.databaseUrl ? 'postgresql' : 'json'});
      }
      if (config.panelOnly && url.pathname === '/webhook') return send(res, 503, 'Configure as credenciais para ativar o atendimento.');

      if (req.method === 'GET' && url.pathname === '/webhook') {
        const ok = url.searchParams.get('hub.mode') === 'subscribe' && config.verifyToken && url.searchParams.get('hub.verify_token') === config.verifyToken;
        if (!ok) return send(res, 403, 'forbidden');
        res.writeHead(200, {'Content-Type': 'text/plain'});
        return res.end(url.searchParams.get('hub.challenge') ?? '');
      }

      if (req.method === 'POST' && url.pathname === '/webhook') {
        const raw = await readBody(req);
        if(registry){let payload;try{payload=JSON.parse(raw.toString('utf8'));}catch{return send(res,400,'invalid JSON');}await registry.receive(payload,raw,req.headers['x-hub-signature-256']);return send(res,200,'ok');}
        if (!verifySignature(raw, req.headers['x-hub-signature-256'], config.appSecret)) return send(res, 401, 'invalid signature');
        let payload;
        try { payload = JSON.parse(raw.toString('utf8')); } catch { return send(res, 400, 'invalid JSON'); }
        for (const status of extractStatuses(payload, config.phoneNumberId)) await store.recordDelivery(status);
        for (const message of extractMessages(payload, config.phoneNumberId)) {
          if (inbox) await inbox.accept(message);
          else await agent.enqueue(message);
        }
        return send(res, 200, 'ok');
      }

      const currentUser = auth ? await auth.user(req) : null;
      const authorized = () => auth ? !!currentUser : config.panelToken && req.headers.authorization === `Bearer ${config.panelToken}`;
      if (auth && req.method === 'POST' && !auth.sameOrigin(req)) return send(res,403,'Origem da solicitação inválida.');
      const administrator=!auth||currentUser?.role==='admin';
      const permission=requiredPermission(url.pathname,req.method);
      if(auth&&currentUser&&permission&&!can(currentUser,permission))return send(res,403,'Seu acesso não permite esta função.');
      if(auth&&currentUser&&url.pathname.startsWith('/access-groups')){
        if(!administrator)return send(res,403,'Apenas administradores podem gerenciar acessos.');
        const groups=new AccessGroups(rootStore);
        if(url.pathname==='/access-groups/catalog'&&req.method==='GET')return send(res,200,PERMISSION_SECTIONS);
        if(url.pathname==='/access-groups'&&req.method==='GET')return send(res,200,await groups.list());
        if(url.pathname==='/access-groups'&&req.method==='POST')return send(res,201,await groups.save(JSON.parse((await readBody(req)).toString()),currentUser));
        const match=url.pathname.match(/^\/access-groups\/([a-f0-9-]{36})$/i);if(match&&req.method==='POST')return send(res,200,await groups.save(JSON.parse((await readBody(req)).toString()),currentUser,match[1]));
        return send(res,404,'not found');
      }
      if(users&&url.pathname.startsWith('/users')){
        if(!currentUser)return send(res,401,'unauthorized');
        if(!administrator)return send(res,403,'Apenas administradores podem gerenciar usuários.');
        if(url.pathname==='/users'&&req.method==='GET')return send(res,200,await users.list());
        if(url.pathname==='/users'&&req.method==='POST')return send(res,201,await users.save(JSON.parse((await readBody(req)).toString()),currentUser));
        const userRoute=url.pathname.match(/^\/users\/([a-f0-9-]{36})(\/invitation)?$/i);
        if(userRoute&&req.method==='POST')return send(res,200,userRoute[2]?await users.reset(userRoute[1],currentUser):await users.save(JSON.parse((await readBody(req)).toString()),currentUser,userRoute[1]));
        return send(res,404,'not found');
      }
      if(currentUser && req.method==='POST')await store.audit('operator_request',currentUser.id,{path:url.pathname});

      if(registry){
        if(!authorized())return send(res,401,'unauthorized');
        if(url.pathname==='/connections' && req.method==='GET'){
          const all=await registry.list();
          return send(res,200,administrator?all:all.filter(c=>currentUser.connections.includes(c.id)).map(c=>can(currentUser,'connections.manage')?c:({id:c.id,name:c.name,displayPhone:c.displayPhone,enabled:c.enabled,provider:c.provider})));
        }
        if(url.pathname==='/connections' && req.method==='POST'&&!administrator)return send(res,403,'A criação e edição de conexões exige administrador.');
        if(url.pathname==='/connections' && req.method==='POST')return send(res,200,await registry.save(JSON.parse((await readBody(req)).toString())));
        const activate=url.pathname.match(/^\/connections\/([a-zA-Z0-9-]+)\/activate$/);
        if(activate&&req.method==='POST'&&!administrator&&!currentUser.connections.includes(activate[1]))return send(res,403,'Você não tem acesso a esta conexão.');
        if(activate&&req.method==='POST')return send(res,200,await registry.activate(activate[1]));
        if(url.pathname==='/contexts'&&req.method==='GET')return send(res,200,administrator?await store.listContexts():(await store.listContexts()).filter(c=>false));
        if(url.pathname==='/contexts'&&req.method==='POST'){
          if(!administrator)return send(res,403,'Gerenciar contextos compartilhados exige administrador.');
          const body=JSON.parse((await readBody(req)).toString());
          if(typeof body.name!=='string'||!body.name.trim()||body.name.length>100||typeof body.body!=='string'||!body.body.trim()||body.body.length>40000)return send(res,400,'Informe nome e contexto (até 40.000 caracteres).');
          if(body.id&&(typeof body.id!=='string'||!/^[a-zA-Z0-9-]{1,80}$/.test(body.id)))return send(res,400,'Identificador inválido.');
          return send(res,200,await store.saveContext(body.id,body.name.trim(),body.body));
        }
        const connectionId=url.searchParams.get('connection')||'default';
        if(!administrator&&!currentUser.connections.includes(connectionId))return send(res,403,'Você não tem acesso a esta conexão.');
        const runtime=await registry.runtime(connectionId);store=runtime.store;inbox=runtime.inbox;
        access=new ConversationAccess(store,currentUser);tags=new TagService(store);
        const phoneRoute=url.pathname.match(/^\/(?:leads|conversations)\/(\d+)(?:\/|$)/);
        if(phoneRoute)await access.assert(phoneRoute[1]);
        if(url.pathname.startsWith('/learning')&&!administrator)return send(res,403,'Análises de toda a conexão são exclusivas de administradores para preservar os atendimentos reservados.');
        const bodyPhoneRoutes=['/calls/start','/calls/permission','/crm/retry','/crm/deals/review'];
        if(req.method==='POST'&&bodyPhoneRoutes.includes(url.pathname)){const body=JSON.parse((await readBody(req)).toString());await access.assert(body.phone);}
        if(req.method==='GET'&&['/calls/permission','/agenda/bookings'].includes(url.pathname)&&url.searchParams.get('phone'))await access.assert(url.searchParams.get('phone'));
        const guardedCall=url.pathname.match(/^\/calls\/([a-f0-9-]{36})\//i);
        if(guardedCall&&calling){const row=(await store.pool.query('SELECT phone FROM whatsapp_calls WHERE connection_id=$1 AND id=$2',[connectionId,guardedCall[1]])).rows[0];if(row)await access.assert(row.phone);}
        const guardedReview=url.pathname.match(/^\/agenda\/review\/([a-f0-9-]{36})$/i);
        if(guardedReview){const row=(await store.pool.query('SELECT phone FROM agenda_bookings WHERE connection_id=$1 AND id=$2',[connectionId,guardedReview[1]])).rows[0];if(row)await access.assert(row.phone);}
        if(url.pathname==='/tags'&&req.method==='GET')return send(res,200,await tags.list());
        if(url.pathname==='/tags'&&req.method==='POST')return send(res,201,await tags.create(JSON.parse((await readBody(req)).toString())));
        const leadTags=url.pathname.match(/^\/leads\/(\d+)\/tags$/);
        if(leadTags&&req.method==='POST'){const body=JSON.parse((await readBody(req)).toString());await tags.assign(leadTags[1],body.tagIds);await store.audit('lead_tags_updated',currentUser?.id||null,{phone:leadTags[1],tagIds:body.tagIds});return send(res,200,{ok:true});}

        if(url.pathname.startsWith('/calls')){
          if(!auth||!calling||!currentUser)return send(res,503,'Ligações exigem uma sessão autenticada e PostgreSQL.');
          if(url.pathname==='/calls/settings'&&req.method==='GET')return send(res,200,await calling.settings(connectionId));
          if(url.pathname==='/calls/settings'&&req.method==='POST')return send(res,200,await calling.configure(connectionId,JSON.parse((await readBody(req)).toString()).enabled));
          if(url.pathname==='/calls'&&req.method==='GET')return send(res,200,await access.filter(await calling.list(connectionId,currentUser,url.searchParams.get('clientId'))));
          if(url.pathname==='/calls/permission'&&req.method==='GET')return send(res,200,await calling.permission(connectionId,url.searchParams.get('phone')));
          const body=req.method==='POST'?JSON.parse((await readBody(req)).toString()):{};
          if(url.pathname==='/calls/permission'&&req.method==='POST')return send(res,200,await calling.requestPermission(connectionId,body.phone,currentUser));
          if(url.pathname==='/calls/start'&&req.method==='POST')return send(res,200,await calling.start(connectionId,body,currentUser));
          const callRoute=url.pathname.match(/^\/calls\/([a-f0-9-]{36})\/(claim|accept|reject|terminate|heartbeat)$/i);
          if(callRoute&&req.method==='POST')return send(res,200,await calling.action(connectionId,callRoute[1],callRoute[2],body,currentUser));
          return send(res,404,'not found');
        }

        if(url.pathname==='/attendants'&&req.method==='GET'){
          const candidates=(await rootStore.pool.query("SELECT id FROM users WHERE active AND password_hash IS NOT NULL ORDER BY name,email")).rows,allowed=[];
          for(const c of candidates){const person=await auth.identity(c.id);if(person&&(person.role==='admin'||person.connections.includes(connectionId))&&can(person,'messages.send'))allowed.push({id:person.id,name:person.name||person.email});}
          return send(res,200,allowed);
        }
        const transfer=url.pathname.match(/^\/leads\/(\d+)\/transfer$/);
        if(transfer&&req.method==='POST'){
          const body=JSON.parse((await readBody(req)).toString()),person=/^[-a-f0-9]{36}$/i.test(body.userId||'')?await auth.identity(body.userId):null;
          if(!person||!(await rootStore.pool.query('SELECT 1 FROM users WHERE id=$1 AND password_hash IS NOT NULL',[person?.id])).rowCount||!(person.role==='admin'||person.connections.includes(connectionId))||!can(person,'messages.send'))return send(res,400,'Escolha um atendente ativo com acesso à conexão e permissão de resposta.');
          const lead=await store.getLead(transfer[1]);if(!lead)return send(res,404,'Contato não encontrado.');if(lead.optedOut||['ganho','perdido'].includes(lead.resultado))return send(res,409,'Reabra o atendimento antes de transferir este contato.');
          await store.updateLead(transfer[1],{status:'encaminhado',humanControlId:crypto.randomUUID(),assignedUserId:person.id,assignedUserName:person.name||person.email});if(cadence)await cadence.stop(connectionId,transfer[1],'Transferido para atendente humano');
          await store.recordEvent({id:crypto.randomUUID(),phone:transfer[1],direction:'out',actor:'system',kind:'handoff',state:'internal',text:'Atendimento transferido para '+(person.name||person.email)+'.'});await store.audit('conversation_transferred',currentUser.id,{phone:transfer[1],assignedUserId:person.id});return send(res,200,{ok:true});
        }
        const avatarRoute=url.pathname.match(/^\/leads\/(\d+)\/(avatar|avatar-upload)$/);
        if(media&&avatarRoute&&req.method==='POST'){
          const phone=avatarRoute[1];if(!await store.getLead(phone))return send(res,404,'Contato não encontrado.');
          if(avatarRoute[2]==='avatar-upload'){let meta;try{meta=JSON.parse(decodeURIComponent(req.headers['x-media-meta']||''));}catch{return send(res,400,'Foto inválida.');}if(!['image/jpeg','image/png'].includes(meta.mime))return send(res,400,'Escolha uma foto JPG ou PNG.');const a=await media.outgoing(connectionId,phone,{...meta,caption:''},req);return send(res,201,{id:a.id});}
          const body=JSON.parse((await readBody(req)).toString());if(body.attachmentId!==null){if(typeof body.attachmentId!=='string'||!/^[-a-f0-9]{36}$/i.test(body.attachmentId))return send(res,400,'Foto inválida.');const a=await media.get(body.attachmentId,connectionId);if(a.phone!==phone||a.kind!=='image'||a.state!=='ready')return send(res,400,'Foto incompatível com o contato.');}
          await store.updateLead(phone,{avatarAttachmentId:body.attachmentId||false});return send(res,200,{ok:true});
        }
        const fileRoute=url.pathname.match(/^\/media\/([a-f0-9-]{36})$/i);if(media&&fileRoute&&req.method==='GET'){await access.assert((await media.get(fileRoute[1],connectionId)).phone);return await media.serve(req,res,fileRoute[1],connectionId);}
        const uploadRoute=url.pathname.match(/^\/leads\/(\d+)\/media$/);if(media&&uploadRoute&&req.method==='POST'){const lead=await store.getLead(uploadRoute[1]);if(!lead||lead.optedOut)return send(res,409,'Contato ausente ou bloqueado.');const events=await store.getEvents(uploadRoute[1]);if(!events.some(e=>e.direction==='in'&&Date.now()-Date.parse(e.at)<86400000))return send(res,409,'Janela de atendimento encerrada para envio de anexo.');let meta;try{meta=JSON.parse(decodeURIComponent(req.headers['x-media-meta']||''));}catch{return send(res,400,'Metadados do anexo inválidos.');}const a=await media.outgoing(connectionId,uploadRoute[1],meta,req);await inbox.accept({id:'media-'+a.id,from:uploadRoute[1],manual:true,operator:currentUser?{id:currentUser.id,name:currentUser.name||currentUser.email,administrator}:undefined,attachmentId:a.id,text:a.caption||'Anexo: '+a.name});return send(res,202,{ok:true,id:a.id});}
        if(cadence&&url.pathname==='/cadence/settings'&&req.method==='GET')return send(res,200,await cadence.settings(connectionId));
        if(cadence&&url.pathname==='/cadence/settings'&&req.method==='POST')return send(res,200,await cadence.save(connectionId,JSON.parse((await readBody(req)).toString()),currentUser?.id||null));
        if(cadence&&url.pathname==='/cadence/templates'&&req.method==='GET')return send(res,200,await cadence.templates(connectionId));
        if(cadence&&url.pathname==='/cadence/queue'&&req.method==='GET')return send(res,200,await access.filter(await cadence.list(connectionId)));
        if(crm&&url.pathname==='/crm/deals/settings'&&req.method==='GET')return send(res,200,await crm.deals.settings(connectionId));
        if(crm&&url.pathname==='/crm/deals/settings'&&req.method==='POST')return send(res,200,await crm.deals.save(connectionId,JSON.parse((await readBody(req)).toString()),currentUser?.id||null));
        if(crm&&url.pathname==='/crm/deals/catalog'&&req.method==='GET')return send(res,200,await crm.deals.catalog(connectionId));
        if(crm&&url.pathname==='/crm/deals/review'&&req.method==='POST'){const body=JSON.parse((await readBody(req)).toString());return send(res,200,await crm.deals.review(connectionId,body.phone,body,currentUser?.id||null));}
        const dealRoute=url.pathname.match(/^\/leads\/(\d+)\/deal(\/refresh|\/finish)?$/);if(crm&&dealRoute){if(req.method==='GET'&&!dealRoute[2])return send(res,200,await crm.deals.link(connectionId,dealRoute[1]));if(req.method==='POST'&&dealRoute[2]==='/refresh')return send(res,200,await crm.deals.refresh(connectionId,dealRoute[1]));if(req.method==='POST'&&dealRoute[2]==='/finish'){const result=await crm.deals.finish(connectionId,dealRoute[1],JSON.parse((await readBody(req)).toString()),currentUser?.id||null);if(cadence)await cadence.stop(connectionId,dealRoute[1],'Negócio encerrado no CRM');return send(res,200,result);}}
        if(crm&&url.pathname==='/crm/settings'&&req.method==='GET')return send(res,200,await crm.publicSettings(connectionId));
        if(crm&&url.pathname==='/crm/settings'&&req.method==='POST')return send(res,200,await crm.save(connectionId,JSON.parse((await readBody(req)).toString()),currentUser?.id||null));
        if(crm&&url.pathname==='/crm/sync'&&req.method==='GET')return send(res,200,await access.filter(await crm.list(connectionId)));
        if(crm&&url.pathname==='/crm/retry'&&req.method==='POST'){const body=JSON.parse((await readBody(req)).toString());if(!/^\d{8,20}$/.test(body.phone||''))return send(res,400,'Telefone inválido.');return send(res,200,await crm.retry(connectionId,body.phone,currentUser?.id||null));}
        if(simulation&&url.pathname==='/simulation/state'&&req.method==='GET')return send(res,200,await simulation.state(url.searchParams.get('sessionId'),connectionId,currentUser?.id||'token-admin'));
        if(simulation&&url.pathname==='/simulation/crm-retry'&&req.method==='POST'){const body=JSON.parse((await readBody(req)).toString());if(!/^\d{10,15}$/.test(body.phone||''))return send(res,400,'Telefone inválido.');return send(res,200,await simulation.retryTestCrm(connectionId,body.phone,currentUser?.id));}
        if(simulation&&url.pathname==='/simulation/crm-records'&&req.method==='GET')return send(res,200,await simulation.testCrmRecords(connectionId));
        if(simulation&&url.pathname==='/simulation/start'&&req.method==='POST')return send(res,200,await simulation.start(connectionId,currentUser?.id||'token-admin',JSON.parse((await readBody(req)).toString())));
        if(simulation&&url.pathname==='/simulation/real-bookings'&&req.method==='GET')return send(res,200,await simulation.realBookings(connectionId));
        const testReview=url.pathname.match(/^\/simulation\/real-review\/([a-f0-9-]{36})$/i);if(simulation&&testReview&&req.method==='POST')return send(res,200,await simulation.reviewReal(connectionId,testReview[1],JSON.parse((await readBody(req)).toString()),currentUser?.id));
        if(simulation&&url.pathname==='/simulation/message'&&req.method==='POST'){const body=JSON.parse((await readBody(req)).toString());return send(res,200,await simulation.message(body.sessionId,connectionId,currentUser?.id||'token-admin',body.text));}
        if(agenda&&url.pathname==='/agenda/settings'&&req.method==='GET')return send(res,200,await agenda.publicSettings(connectionId));
        if(agenda&&url.pathname==='/agenda/settings'&&req.method==='POST')return send(res,200,await agenda.save(connectionId,JSON.parse((await readBody(req)).toString()),currentUser?.id||null));
        if(agenda&&url.pathname==='/agenda/catalog'&&req.method==='GET')return send(res,200,await agenda.catalog(connectionId));
        if(agenda&&url.pathname==='/agenda/bookings'&&req.method==='GET')return send(res,200,await access.filter(await agenda.bookings(connectionId,url.searchParams.get('phone'))));
        const agendaReview=url.pathname.match(/^\/agenda\/review\/([a-f0-9-]{36})$/i);
        if(agenda&&agendaReview&&req.method==='POST')return send(res,200,await agenda.review(connectionId,agendaReview[1],JSON.parse((await readBody(req)).toString()),currentUser?.id||null));
        const qualification=url.pathname.match(/^\/leads\/(\d+)\/qualify$/);
        if(qualification&&req.method==='POST')return send(res,200,await evaluateLead(store,qualification[1]));
        const leadState=url.pathname.match(/^\/leads\/(\d+)\/state$/);
        if(leadState&&req.method==='POST'){
          const body=JSON.parse((await readBody(req)).toString());
          if(body.temperatura!==undefined&&!['quente','morno','frio','nao_classificado'].includes(body.temperatura)||body.resultado!==undefined&&!['aberto','apresentacao_solicitada','apresentacao_agendada','ganho','perdido'].includes(body.resultado))return send(res,400,'Classificação inválida.');
          if(body.cadenceConsent!==undefined&&typeof body.cadenceConsent!=='boolean')return send(res,400,'Autorização de acompanhamento inválida.');
          if(crm&&['ganho','perdido'].includes(body.resultado)){const linked=await crm.deals.link(connectionId,leadState[1]);if(linked) return send(res,409,'Confirme o fechamento pelo negócio do CRM, informando valor ou motivo.');}
          const patch={...(body.cadenceConsent!==undefined?{cadenceConsent:body.cadenceConsent,cadenceConsentSource:'Registrado pelo gestor '+(currentUser?.email||''),...(body.cadenceConsent?{cadenceDeclined:false}:{})}:{}),...(body.temperatura?{temperatura:body.temperatura,motivoTemperatura:'Classificação ajustada pelo operador.'}:{}),...(body.resultado?{resultado:body.resultado}:{})};
          if(!Object.keys(patch).length)return send(res,400,'Informe temperatura ou resultado.');
          if(body.resultado)await store.pool.query('INSERT INTO lead_outcomes(connection_id,phone,outcome,user_id) VALUES($1,$2,$3,$4)',[connectionId,leadState[1],body.resultado,currentUser?.id||null]);
          const updated=await store.updateLead(leadState[1],patch);if(cadence){if(['ganho','perdido'].includes(body.resultado)||body.cadenceConsent===false)await cadence.stop(connectionId,leadState[1],'Encerrado ou autorização removida pelo gestor');else if(body.cadenceConsent===true)await cadence.armLatest(connectionId,leadState[1]);}return send(res,200,updated);
        }
        if(learning&&url.pathname==='/learning'&&req.method==='GET')return send(res,200,await learning.list(connectionId));
        if(learning&&url.pathname==='/learning/analyze'&&req.method==='POST')return send(res,200,await learning.analyze(connectionId));
        const decision=url.pathname.match(/^\/learning\/([a-zA-Z0-9-]+)\/(apply|reject|undo)$/);
        if(learning&&decision&&req.method==='POST')return send(res,200,await learning.decide(connectionId,decision[1],decision[2],currentUser?.id||null));
      }

      if(req.method==='GET' && ['/reports','/reports/messages.csv'].includes(url.pathname)){
        if(!authorized())return send(res,401,'unauthorized');
        if(!store.reports)return send(res,503,'Relatórios disponíveis com PostgreSQL.');
        const {from,to}=reportPeriod(url);
        if(url.pathname==='/reports')return send(res,200,await store.reports(from,to,currentUser));
        const rows=await store.exportMessages(from,to,currentUser);
        if(rows.length>100000)return send(res,422,'Reduza o período para exportar até 100.000 mensagens.');
        await store.audit('messages_exported',currentUser?.id||null,{from,to,rows:rows.length});
        const csvCell=value=>'"'+String(value??'').replace(/^[=+\-@\t\r]/,"'$&").replaceAll('"','""')+'"';
        const lines=[['Data','Telefone','Direção','Mensagem','Situação'],...rows.map(row=>[new Date(row.occurred_at).toISOString(),"'"+row.phone,row.direction==='in'?'Recebida':'Enviada',row.text,row.status])];
        res.writeHead(200,{'Content-Type':'text/csv; charset=utf-8','Content-Disposition':'attachment; filename="mensagens.csv"'});
        return res.end('\uFEFF'+lines.map(line=>line.map(csvCell).join(';')).join('\r\n'));
      }

      if (req.method === 'GET' && url.pathname === '/leads') {
        if (!authorized()) return send(res, 401, 'unauthorized');
        const leads=access?await access.leads():await store.listLeads();
        return send(res,200,tags?await tags.decorate(leads):leads);
      }

      if (req.method === 'GET' && url.pathname === '/inbox') {
        if (!authorized()) return send(res, 401, 'unauthorized');
        const entries=Object.entries(inbox?.jobs||{});const allowed=access?await access.filter(entries,entry=>entry[1].message.from):entries;return send(res,200,Object.fromEntries(allowed));
      }

      if (req.method === 'POST' && url.pathname === '/inbox/resolve') {
        if (!authorized()) return send(res, 401, 'unauthorized');
        if (!inbox) return send(res, 503, 'Fila indisponível');
        const body = JSON.parse((await readBody(req)).toString('utf8'));
        if (typeof body.id !== 'string' || body.resolution !== 'handled_manually') {
          return send(res, 400, 'Informe id e resolution=handled_manually após conferir o atendimento.');
        }
        const key = Buffer.from(body.id).toString('base64url');
        if(access&&inbox.jobs[key])await access.assert(inbox.jobs[key].message.from);
        const resolved = await inbox.update(jobs => {
          if (jobs[key]?.status !== 'attention') return false;
          jobs[key].status = 'done';
          jobs[key].resolution = 'handled_manually';
          jobs[key].resolvedAt = new Date().toISOString();
          return true;
        });
        if (!resolved) return send(res, 409, 'Mensagem não está aguardando conferência');
        if (!config.panelOnly) inbox.resume();
        return send(res, 200, {ok: true});
      }

      const automation = url.pathname.match(/^\/leads\/(\d+)\/automation$/);
      if (req.method === 'POST' && automation) {
        if (!authorized()) return send(res, 401, 'unauthorized');
        const body = JSON.parse((await readBody(req)).toString('utf8'));
        if (typeof body.enabled !== 'boolean') return send(res, 400, 'Informe enabled booleano');
        if ((await store.listLeads())[automation[1]]?.optedOut && body.enabled) return send(res, 409, 'Contato bloqueado por descadastro.');
        const lead = await store.updateLead(automation[1], {status: body.enabled ? 'em_conversa' : 'encaminhado',humanControlId:crypto.randomUUID(),...(body.enabled?{assignedUserId:false,assignedUserName:false}:{})});
        return send(res, 200, lead);
      }

      const conversationRoute = url.pathname.match(/^\/conversations\/(\d+)$/);
      if (req.method === 'GET' && conversationRoute) {
        if (!authorized()) return send(res, 401, 'unauthorized');
        return send(res, 200, await store.getEvents(conversationRoute[1]));
      }
      const blockRoute = url.pathname.match(/^\/leads\/(\d+)\/block$/);
      if (req.method === 'POST' && blockRoute) {
        if (!authorized()) return send(res, 401, 'unauthorized');
        return send(res, 200, await store.updateLead(blockRoute[1], {optedOut: true, status: 'bloqueado', optedOutAt: new Date().toISOString()}));
      }
      if (url.pathname === '/context' && ['GET','POST'].includes(req.method)) {
        if (!authorized()) return send(res, 401, 'unauthorized');
        if (req.method === 'POST') {
          const body = JSON.parse((await readBody(req)).toString('utf8'));
          if (typeof body.text !== 'string' || body.text.length > 12000) return send(res, 400, 'Contexto limitado a 12.000 caracteres.');
          await store.saveSettings({context: body.text});
        }
        return send(res, 200, {text: (await store.getSettings()).context || ''});
      }
      const replyRoute = url.pathname.match(/^\/leads\/(\d+)\/reply$/);
      if (req.method === 'POST' && replyRoute) {
        if (!authorized()) return send(res, 401, 'unauthorized');
        if (config.panelOnly || !inbox) return send(res, 503, 'Atendimento ainda não configurado.');
        const body = JSON.parse((await readBody(req)).toString('utf8'));
        if (typeof body.text !== 'string' || !body.text.trim() || body.text.length > 4000 || !/^[a-zA-Z0-9-]{16,80}$/.test(body.requestId || '')) return send(res, 400, 'Mensagem ou identificador inválido.');
        const phone = replyRoute[1],currentLead=(await store.listLeads())[replyRoute[1]];
        if (currentLead?.optedOut) return send(res, 409, 'Contato bloqueado por descadastro.');
        const events = await store.getEvents(phone);
        if (!events.some(event => event.direction === 'in' && Date.now() - Date.parse(event.at) < 86400000)) return send(res, 409, 'Envio livre disponível somente após mensagem do cliente nas últimas 24 horas.');
        if(body.sign!==undefined&&typeof body.sign!=='boolean')return send(res,400,'Opção de assinatura inválida.');
        const chooseSignature=!auth||can(currentUser,'signature.choose');
        if(!chooseSignature&&body.sign!==undefined&&body.sign!==currentUser.signature_default)return send(res,403,'Seu grupo não permite alterar a assinatura.');
        const sign=body.sign??currentUser?.signature_default??false;
        const actorName=String(currentUser?.name||'Equipe Command').replace(/[\r\n*_~`]/g,'').trim().slice(0,100);
        const text=(sign?'*'+actorName+':*\n':'')+body.text.trim();if(text.length>4096)return send(res,400,'Mensagem com assinatura excede o limite permitido.');
        await store.updateLead(phone, {status: 'encaminhado',humanControlId:crypto.randomUUID(),...(currentUser&&!currentLead?.assignedUserId?{assignedUserId:currentUser.id,assignedUserName:currentUser.name||currentUser.email}:{})});
        await inbox.accept({id:'manual-'+body.requestId, from:phone, text, manual:true,operator:currentUser?{id:currentUser.id,name:actorName,signed:sign,administrator}:undefined});
        return send(res, 202, {queued:true});
      }

      // Escolha da IA em tempo de execução: GET mostra a atual e as disponíveis; POST {"provider":"deepseek"} troca.
      if (url.pathname === '/config' && (req.method === 'GET' || req.method === 'POST')) {
        if (!authorized()) return send(res, 401, 'unauthorized');
        if (req.method === 'POST') {
          let body;
          try { body = JSON.parse((await readBody(req)).toString('utf8') || '{}'); } catch { return send(res, 400, 'JSON inválido'); }
          if (!PROVIDERS.includes(body.provider)) return send(res, 400, `Use um destes provedores: ${PROVIDERS.join(', ')}.`);
          const settings = providerSettings(body.provider);
          if (!settings.ready) return send(res, 400, `Provedor ${body.provider} sem chave ou modelo configurado no .env.`);
          await store.saveSettings({aiProvider: body.provider});
        }
        const active = (await store.getSettings()).aiProvider || config.aiProvider;
        return send(res, 200, {
          provider: active,
          disponiveis: Object.fromEntries(PROVIDERS.map(name => {
            const s = providerSettings(name);
            return [name, {modelo: s.model, configurado: s.ready}];
          })),
        });
      }

      return send(res, 404, 'not found');
    } catch (error) {
      log.error('[http]', error);
      if (!res.headersSent) send(res, error instanceof SyntaxError ? 400 : error.status ?? 500, error instanceof SyntaxError ? 'JSON inválido' : error.status ? error.message : 'error');
    }
  };
}

function send(res, status, body) {
  const json = typeof body !== 'string';
  res.writeHead(status, {'Content-Type': json ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8'});
  res.end(json ? JSON.stringify(body) : body);
}

export function reportPeriod(url){
  const date=new Date();
  const defaults=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(date);
  const fromDate=url.searchParams.get('from')||defaults.slice(0,8)+'01';
  const toDate=url.searchParams.get('to')||defaults;
  const valid=value=>/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
  if(!valid(fromDate)||!valid(toDate))throw Object.assign(new Error('Período inválido.'),{status:400});
  const from=new Date(fromDate+'T00:00:00-03:00');
  const to=new Date(Date.parse(toDate+'T00:00:00-03:00')+86400000);
  if(to<=from||to-from>366*86400000)throw Object.assign(new Error('Selecione um período de até 366 dias, com início anterior ao fim.'),{status:400});
  return {from:from.toISOString(),to:to.toISOString()};
}

const requestBodies=new WeakMap();
function readBody(req) {
  if(requestBodies.has(req))return requestBodies.get(req);
  const pending=new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(Object.assign(new Error('payload too large'), {status: 413})); req.destroy(); return; }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
  requestBodies.set(req,pending);return pending;
}

async function main() {
  loadDotEnv();
  const config = loadConfig();
  if(process.env.NODE_ENV==='production'&&!config.databaseUrl)throw new Error('DATABASE_URL é obrigatória em produção.');
  if (!config.databaseUrl && !config.panelToken) throw new Error('Configure DATABASE_URL para produção ou PAINEL_TOKEN para o modo legado local.');
  if (!config.panelOnly) assertReady(config);
  const store = config.databaseUrl ? new PgStore(config.databaseUrl,config.dataDir) : new Store(config.dataDir);
  await store.init({workerLock:true});
  const auth=config.databaseUrl?new PasswordAuth(store,config):null;
  if(auth)await auth.init();
  if(config.databaseUrl && !/^[a-f0-9]{64}$/i.test(config.connectionsKey||''))throw new Error('Configure CONNECTIONS_ENCRYPTION_KEY para proteger as conexões.');
  const agenda=config.databaseUrl?new AgendaService(store,config):null;
  if(agenda)await agenda.init();
  const crm=config.databaseUrl?new CrmService(store,config):null;
  if(crm)await crm.init();
  const cadence=config.databaseUrl?new CadenceService(store,config):null;
  if(cadence)await cadence.init();
  const media=config.databaseUrl?new MediaService(store,config):null;
  if(media)await media.init();
  const calling=config.databaseUrl?new CallingService(store,config):null;
  if(calling)await calling.init();
  const registry=config.databaseUrl?new ConnectionRegistry(store,config,{agenda,crm,cadence,media,calling}):null;
  calling?.bind(registry);
  cadence?.bind(registry);media?.bind(registry);
  if(registry)await registry.init();
  const simulation=registry?new SimulationService(store,config):null;
  if(simulation)await simulation.init();
  const learning=registry?new LearningService(store,registry):null;
  const whatsapp = new WhatsAppClient(config, fetch, store);
  const agent = new SalesAgent({config, store, whatsapp});
  const inbox = registry?(await registry.runtime('default')).inbox:new DurableInbox({store, agent});
  if(!registry){await inbox.init();if (!config.panelOnly) inbox.resume();}
  if(crm&&!config.panelOnly)crm.start();
  if(cadence&&!config.panelOnly)cadence.start();
  const learningTimer=learning?setInterval(()=>learning.tick().catch(error=>console.error('[aprendizado]',error.message)),3600000):null;
  const firstLearning=learning?setTimeout(()=>learning.tick().catch(error=>console.error('[aprendizado]',error.message)),30000):null;
  const callingTimer=calling?setInterval(()=>calling.sweep().catch(()=>console.error('[chamadas] Falha na conferência de ligações.')),5000):null;
  const server=http.createServer(createApp({config, agent, store, inbox,auth,registry,learning,agenda,simulation,crm,cadence,media,calling})).listen(config.port, config.host, () => {
    console.log(`Agente comercial ouvindo na porta ${config.port}. Webhook: /webhook`);
    store.getSettings().then(s => {
      const name = s.aiProvider || config.aiProvider;
      const p = providerSettings(name);
      console.log(`IA ativa: ${name} (${p.model || 'sem modelo'})${p.ready ? '' : ' — ATENÇÃO: falta chave ou modelo no .env'}`);
    }).catch(() => {});
    if (!config.sellerNumbers.length) console.warn('VENDEDOR_WHATSAPP vazio: os leads encaminhados ficam só em data/leads.json.');
  });
  let stopping=false;
  const shutdown=()=>{if(stopping)return;stopping=true;clearInterval(callingTimer);clearInterval(learningTimer);clearTimeout(firstLearning);server.close(async()=>{if(registry)await registry.drain();else await inbox.drain();await simulation?.close();await crm?.close();await cadence?.close();await store.close?.();process.exit(0);});};
  process.on('SIGTERM',shutdown);
  process.on('SIGINT',shutdown);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => { console.error(error.message); process.exit(1); });
}
