// Termina a configuração do número comercial na WhatsApp Cloud API:
//   1. registra o número (PIN da confirmação em duas etapas)
//   2. inscreve o app na conta do WhatsApp (para o webhook receber mensagens)
//   3. envia a logomarca e atualiza o perfil comercial
// Uso: node server/configurar-meta.js 123456 [caminho-da-logo.jpg]
// Lê server/.env. Nunca imprime o token.
import fs from 'node:fs/promises';
import path from 'node:path';
import {loadConfig, loadDotEnv} from './config.js';

loadDotEnv();
const config = loadConfig();
const APP_ID = process.env.META_APP_ID ?? '1922946735810180';
const WABA_ID = process.env.WHATSAPP_WABA_ID ?? '3454868058013423';
const pin = process.argv[2];
const logo = path.resolve(process.argv[3] ?? 'logo-command-comercial.jpg');
const graph = `https://graph.facebook.com/${config.graphVersion}`;

if (!config.accessToken) fail('WHATSAPP_ACCESS_TOKEN está vazio no server/.env.');
if (!/^\d{6}$/.test(pin ?? '')) fail('Informe o PIN de 6 dígitos.');

async function call(url, {method = 'POST', body, headers = {}, auth = 'Bearer'} = {}) {
  const response = await fetch(url, {
    method,
    headers: {Authorization: `${auth} ${config.accessToken}`, ...(body && !(body instanceof Uint8Array) ? {'Content-Type': 'application/json'} : {}), ...headers},
    body: body instanceof Uint8Array ? body : body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(30000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.error_user_msg || data?.error?.message || `HTTP ${response.status}`);
  return data;
}

async function step(name, fn) {
  try {
    const result = await fn();
    console.log(`OK  ${name}${result ? `: ${result}` : ''}`);
    return true;
  } catch (error) {
    console.log(`ERRO ${name}: ${error.message}`);
    return false;
  }
}

await step('Registro do número na Cloud API', async () => {
  await call(`${graph}/${config.phoneNumberId}/register`, {body: {messaging_product: 'whatsapp', pin}});
});

await step('Inscrição do app na conta do WhatsApp', async () => {
  await call(`${graph}/${WABA_ID}/subscribed_apps`);
});

await step('Logomarca no perfil', async () => {
  const bytes = new Uint8Array(await fs.readFile(logo));
  const session = await call(`${graph}/${APP_ID}/uploads?file_length=${bytes.length}&file_type=image/jpeg&file_name=${encodeURIComponent(path.basename(logo))}`);
  const upload = await call(`${graph}/${session.id}`, {body: bytes, auth: 'OAuth', headers: {file_offset: '0'}});
  await call(`${graph}/${config.phoneNumberId}/whatsapp_business_profile`, {body: {messaging_product: 'whatsapp', profile_picture_handle: upload.h}});
});

await step('Situação do número', async () => {
  const info = await call(`${graph}/${config.phoneNumberId}?fields=display_phone_number,verified_name,name_status,status,platform_type,code_verification_status,quality_rating`, {method: 'GET'});
  return `${info.display_phone_number} · ${info.verified_name} · nome ${info.name_status} · status ${info.status} · plataforma ${info.platform_type}`;
});

function fail(message) {
  console.log(`ERRO ${message}`);
  process.exit(1);
}
