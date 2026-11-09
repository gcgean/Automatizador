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
        out.push({id: msg.id, from: msg.from, name: names[msg.from] ?? '', type: msg.type, text: describe(msg)});
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
    case 'audio': return '[O cliente enviou um áudio. Você não consegue ouvir áudios.]';
    case 'image': return `[O cliente enviou uma imagem${msg.image?.caption ? ` com a legenda: ${msg.image.caption}` : ''}. Você não consegue ver imagens.]`;
    case 'document': return `[O cliente enviou um documento${msg.document?.filename ? ` (${msg.document.filename})` : ''}. Você não consegue abrir arquivos.]`;
    case 'video': return '[O cliente enviou um vídeo. Você não consegue assistir vídeos.]';
    case 'sticker': return '[O cliente enviou uma figurinha.]';
    case 'location': return '[O cliente enviou uma localização.]';
    default: return `[O cliente enviou uma mensagem do tipo ${msg.type}.]`;
  }
}

export class WhatsAppClient {
  constructor({accessToken, phoneNumberId, graphVersion}, fetchImpl = fetch) {
    this.base = `https://graph.facebook.com/${graphVersion}/${phoneNumberId}`;
    this.accessToken = accessToken;
    this.fetch = fetchImpl;
  }

  async call(pathname, body) {
    const response = await this.fetch(`${this.base}/${pathname}`, {
      method: 'POST',
      headers: {Authorization: `Bearer ${this.accessToken}`, 'Content-Type': 'application/json'},
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(20000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail = data?.error?.message ?? `HTTP ${response.status}`;
      const error = new Error(`WhatsApp API: ${detail}`);
      error.code = data?.error?.code;
      throw error;
    }
    return data;
  }

  sendText(to, text) {
    return this.call('messages', {messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'text', text: {preview_url: false, body: text}});
  }

  markRead(messageId) {
    return this.call('messages', {messaging_product: 'whatsapp', status: 'read', message_id: messageId});
  }

  register(pin) {
    return this.call('register', {messaging_product: 'whatsapp', pin});
  }
}
