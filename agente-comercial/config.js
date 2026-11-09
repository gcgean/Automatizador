import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

// Carrega server/.env quando o processo não foi iniciado com --env-file (ex.: Node do Electron).
// Variáveis já definidas no ambiente têm prioridade.
export function loadDotEnv(file = path.join(here, '.env')) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m && process.env[m[1]] === undefined && m[2] !== '') process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

export function loadConfig(env = process.env) {
  const get = (name, fallback = '') => env[name] ?? fallback;
  return {
    port: Number(get('PORT', '3333')),
    verifyToken: get('WHATSAPP_VERIFY_TOKEN'),
    appSecret: get('WHATSAPP_APP_SECRET'),
    accessToken: get('WHATSAPP_ACCESS_TOKEN'),
    phoneNumberId: get('WHATSAPP_PHONE_NUMBER_ID', '1395892046947138'),
    graphVersion: get('WHATSAPP_GRAPH_VERSION', 'v23.0'),
    panelToken: get('PAINEL_TOKEN'),
    sellerNumbers: get('VENDEDOR_WHATSAPP').split(',').map(s => s.replace(/\D/g, '')).filter(Boolean),
    aiProvider: get('AI_PROVIDER', 'claude'),
    dataDir: path.resolve(get('DATA_DIR', path.join(here, 'data'))),
    scriptFile: path.resolve(get('ROTEIRO_FILE', path.join(here, 'roteiro-comercial.md'))),
  };
}

export function assertReady(config) {
  const missing = [];
  if (!config.verifyToken) missing.push('WHATSAPP_VERIFY_TOKEN');
  if (!config.appSecret) missing.push('WHATSAPP_APP_SECRET');
  if (!config.accessToken) missing.push('WHATSAPP_ACCESS_TOKEN');
  if (!config.phoneNumberId) missing.push('WHATSAPP_PHONE_NUMBER_ID');
  if (missing.length) throw new Error(`Configure no server/.env: ${missing.join(', ')}.`);
}
