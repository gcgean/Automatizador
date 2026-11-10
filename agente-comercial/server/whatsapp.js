import crypto from 'node:crypto';

export function verifySignature(rawBody, header, appSecret) {
  if (!header || !appSecret) return false;
  const expected = 'sha256=' + crypto.createHmac('sha256', appSecret).update(rawBody).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Extrai mensagens recebidas do payload do webhook, apenas para o número comercial.
// A conta do WhatsApp também tem o número de suporte, então eventos de outros números são ignorados.
export function extractMessages(payload, phoneNumberId) {
  const out = [];
  for (const entry of payload?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value ?? {};
      if (change.field !== 'messages' || value.metadata?.phone_number_id !== phoneNumberId) continue;
      const names = Object.fromEntries((value.contacts ?? []).map(c => [c.wa_id, c.profile?.name ?? '']));
      for (const msg of value.messages ?? []) {
        if(msg.type==='interactive'&&msg.interactive?.type==='call_permission_reply')continue;
        out.push({id: msg.id, from: msg.from, name: names[msg.from] ?? '', type: msg.type, text: describe(msg),...(['audio','image','video','document','sticker'].includes(msg.type)&&msg[msg.type]?.id?{media:{kind:msg.type,id:msg[msg.type].id,mime:msg[msg.type].mime_type||'',filename:msg[msg.type].filename||'',caption:msg[msg.type].caption||'',sha256:msg[msg.type].sha256||''}}:{})});
      }
    }
  }
  return out;
}

function describe(msg) {
  switch (msg.type) {
    case 'text': return msg.text?.body ?? '';
    case 'button': return msg.button?.text ?? '';
    case 'interactive': return msg.interactive?.button_reply?.title ?? msg.interactive?.list_reply?.title ?? '[resposta interativa]';
    case 'audio': return '[áudio recebido]';
    case 'image': return `[O cliente enviou uma imagem${msg.image?.caption ? ` com a legenda: ${msg.image.caption}` : ''}.]`;
    case 'document': return `[O cliente enviou um documento${msg.document?.filename ? ` (${msg.document.filename})` : ''}.]`;
    case 'video': return '[Vídeo recebido]';
    case 'sticker': return '[O cliente enviou uma figurinha.]';
    case 'location': return '[O cliente enviou uma localização.]';
    default: return `[O cliente enviou uma mensagem do tipo ${msg.type}.]`;
  }
}

export class WhatsAppClient {
  constructor({accessToken, phoneNumberId, graphVersion}, fetchImpl = fetch, store = null) {
    this.base = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}`;
    this.accessToken = accessToken;
    this.fetch = fetchImpl;
    this.store = store;
  }

  async call(pathname, body) {
    let response;try{response = await this.fetch(`${this.base}/${pathname}`, {
      method: 'POST',
      headers: {Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });}catch(cause){const error=new Error('Falha de conexão com a Meta. O envio não pôde ser confirmado; confira o recebimento antes de reenviar.');error.code=cause.cause?.code||cause.name;throw error;}
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data?.error?.message ?? `HTTP ${response.status}`;
      const error = new Error(`WhatsApp API: ${detail}`);
      error.code = data?.error?.code;
      throw error;
    }
    return data;
  }

  async sendText(to, text, metadata = {}) {
    const id = crypto.randomUUID();
    const event = {id, phone: to, direction: 'out', text, state: 'sending',...metadata};
    if (this.store) await this.store.recordEvent(event);
    try {
      const result = await this.call('messages', {messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: {preview_url: false, body: text}});
      const messageId = result.messages?.[0]?.id;
      if (!messageId) throw new Error('A Meta não retornou o identificador da mensagem. Confira o envio.');
      if (this.store) await this.store.recordEvent({...event, messageId, state: 'accepted'});
      return result;
    } catch (error) {
      if (this.store) await this.store.recordEvent({...event, state: 'uncertain', error: error.message});
      throw error;
    }
  }

  async sendMedia(to,kind,media,text,metadata={}){const event={id:crypto.randomUUID(),phone:to,direction:'out',text,state:'sending',...metadata};if(this.store)await this.store.recordEvent(event);try{const result=await this.call('messages',{messaging_product:'whatsapp',recipient_type:'individual',to,type:kind,[kind]:media});if(!result.messages?.[0]?.id)throw new Error('A Meta não confirmou o envio do anexo.');if(this.store)await this.store.recordEvent({...event,state:'accepted',messageId:result.messages[0].id});return result;}catch(e){if(this.store)await this.store.recordEvent({...event,state:'uncertain',error:e.message});throw e;}}

  async sendTemplate(to,template,text,metadata={}){
    const event={id:crypto.randomUUID(),phone:to,direction:'out',text,state:'sending',...metadata};if(this.store)await this.store.recordEvent(event);
    try{const result=await this.call('messages',{messaging_product:'whatsapp',recipient_type:'individual',to,type:'template',template});if(!result.messages?.[0]?.id)throw new Error('A Meta não confirmou o identificador do envio.');if(this.store)await this.store.recordEvent({...event,messageId:result.messages[0].id,state:'accepted'});return result;}catch(e){if(this.store)await this.store.recordEvent({...event,state:'uncertain',error:e.message});throw e;}
  }

  markRead(messageId) {
    return this.call('messages', {messaging_product: 'whatsapp', status: 'read', message_id: messageId});
  }

  register(pin) {
    return this.call('register', {messaging_product: 'whatsapp', pin});
  }
}

export function extractStatuses(payload, phoneNumberId) {
  const result = [];
  for (const entry of payload?.entry || []) {
    for (const change of entry.changes || []) {
      if (change.field !== 'messages' || change.value?.metadata?.phone_number_id !== phoneNumberId) continue;
      for (const status of change.value.statuses || []) {
        if (typeof status.id !== 'string' || !['sent','delivered','read','failed'].includes(status.status)) continue;
        result.push({id: status.id, status: status.status, timestamp: status.timestamp, phone: status.recipient_id, errors: status.errors || []});
      }
    }
  }
  return result;
}
