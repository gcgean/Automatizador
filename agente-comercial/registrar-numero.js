// Registra o número comercial na WhatsApp Cloud API (passo único, depois da verificação por SMS).
// Uso: npm run server:registrar -- 123456   (o PIN de 6 dígitos da confirmação em duas etapas)
import {loadConfig, loadDotEnv} from './config.js';
import {WhatsAppClient} from './whatsapp.js';

loadDotEnv();

const pin = process.argv[2] ?? process.env.WHATSAPP_PIN;
if (!/^\d{6}$/.test(pin ?? '')) {
  console.error('Informe o PIN de 6 dígitos: npm run server:registrar -- 123456');
  process.exit(1);
}
const config = loadConfig();
if (!config.accessToken) {
  console.error('Configure WHATSAPP_ACCESS_TOKEN no server/.env antes de registrar.');
  process.exit(1);
}
try {
  await new WhatsAppClient(config).register(pin);
  console.log(`Número ${config.phoneNumberId} registrado na Cloud API.`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
