import {acceptTicketMessage} from './tickets.js';
const fields = ['messages', 'smb_message_echoes', 'smb_app_state_sync', 'history', 'account_update', 'message_template_status_update'];
export const coexistenceFields = fields;

export async function connectBusinessApp(registry, body, companyId) {
  const {config} = registry;
  const {code, phoneNumberId} = body;
  const accounts = body.messagingAccountIds ?? [body.wabaId];
  const fail = message => Object.assign(new Error(message), {status:400});
  if (!config.signupConfigId || !config.signupAppSecret || !config.connectionsKey) throw fail('Configure o Embedded Signup e a criptografia no servidor.');
  if (!code || typeof code !== 'string' || code.length > 4096 || !/^\d{5,30}$/.test(phoneNumberId) || !Array.isArray(accounts) || !accounts.length || !accounts.every(id=>typeof id==='string' && /^\d{5,30}$/.test(id))) throw fail('O cadastro da Meta está incompleto.');
  const base = 'https://graph.facebook.com/' + config.graphVersion + '/';
  async function graph(path, options) {
    const response = await registry.fetch(base + path, {...options, signal:AbortSignal.timeout(30000)});
    const data = await response.json();
    if (!response.ok || data.error) throw fail('A Meta recusou a conexão (código ' + (data.error?.code || response.status) + ').');
    return data;
  }
  const token = (await graph('oauth/access_token', {method:'POST',body:new URLSearchParams({client_id:config.signupAppId,client_secret:config.signupAppSecret,code})})).access_token;
  if (!token) throw fail('A Meta não forneceu a credencial da conexão.');
  const headers = {Authorization:'Bearer ' + token};
  let phone, wabaId;
  for (const account of new Set(accounts)) {
    const endpoint = account + '/phone_numbers?fields=id,is_on_biz_app,display_phone_number';
    let path = endpoint;
    while (path) {
      const page = await graph(path,{headers});
      phone = page.data?.find(item => item.id === phoneNumberId);
      if (phone) break;
      const after = page.paging?.next && page.paging?.cursors?.after;
      path = after ? endpoint + '&after=' + encodeURIComponent(after) : null;
    }
    if (phone) {wabaId=account;break;}
  }
  if (![true,'true'].includes(phone?.is_on_biz_app)) throw fail('A Meta não confirmou a coexistência deste número na conta selecionada.');
  const webhookMode = 'waba_override';
  return registry.save({webhookMode,name:body.name,contextId:body.contextId,provider:body.provider,phoneNumberId,wabaId,appId:config.signupAppId,appSecret:config.signupAppSecret,accessToken:token,displayPhone:phone.display_phone_number},companyId,true);
}

export async function receiveBusinessApp(store, payload, phoneNumberId, mediaService) {
  for (const entry of payload.entry || []) for (const {field,value} of entry.changes || []) {
    if (value?.metadata?.phone_number_id !== phoneNumberId) continue;
    if (field === 'smb_app_state_sync') {
      for (const item of value.state_sync || []) {
        const phone = item.contact?.phone_number?.replace(/^\+/, '');
        if (/^\d{5,20}$/.test(phone) && item.action !== 'remove' && item.contact.full_name) await store.updateLead(phone,{nomeWhatsApp:item.contact.full_name});
      }
    }
    if (field === 'smb_message_echoes') for (const msg of value.message_echoes || []) await saveMessage(store,msg,msg.to,true,true,mediaService);
    if (field === 'history') for (const batch of value.history || []) for (const thread of batch.threads || []) {
      for (const msg of thread.messages || []) await saveMessage(store,msg,thread.id,msg.from !== thread.id,false);
    }
  }
}

async function saveMessage(store,msg,phone,outgoing,live,mediaService) {
  const date = new Date(Number(msg.timestamp)*1000);
  if (!msg.id || !/^\d{5,20}$/.test(phone) || !Number.isFinite(date.getTime())) return;
  const event = {id:msg.id,messageId:msg.id,phone,direction:outgoing?'out':'in',actor:outgoing?'human':'client',type:msg.type,text:msg.text?.body || msg[msg.type]?.caption || '[' + (msg.type || 'mensagem') + ']',at:date.toISOString(),source:live?'whatsapp_app':'whatsapp_history',...(outgoing?{state:'sent'}:{})};
  const media = msg[msg.type];
  if (live && media?.id && ['audio','image','video','document','sticker'].includes(msg.type)) {
    event.media = {kind:msg.type,id:media.id,mime:media.mime_type || '',filename:media.filename || '',caption:media.caption || ''};
  }
  await store.transaction(async tx => {
    if (live) {
      const receipt=await acceptTicketMessage(tx,phone,msg.id,event.at,'whatsapp_app');
      const result = await tx.pool.query('INSERT INTO messages(connection_id,id,phone,direction,occurred_at,message_id,data) VALUES($1,$2,$3,$4,$5,$2,$6) ON CONFLICT(connection_id,id) DO NOTHING',[store.connectionId,msg.id,phone,event.direction,event.at,event]);
      if (result.rowCount&&!receipt?.stale) await tx.updateLead(phone,{status:'encaminhado',humanControlId:msg.id,businessAppControlId:msg.id,conversationClosed:false,conversationReopenedAt:event.at,conversationReopenedBy:'whatsapp_app'});
    } else {
      const result = await tx.pool.query('INSERT INTO business_app_history(connection_id,id,phone,data) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING',[store.connectionId,msg.id,phone,event]);
      if (result.rowCount) await tx.updateLead(phone,{});
    }
  });
  if (event.media && mediaService) {
    const attachment = await mediaService.receive(store.connectionId,phone,msg.id,event.media,undefined,{transcribe:false});
    await store.recordEvent({...event,attachment:mediaService.public(attachment)});
  }
}
