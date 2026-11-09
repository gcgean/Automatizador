import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {loadConfig, assertReady, loadDotEnv} from './config.js';
import {Store} from './store.js';
import {WhatsAppClient, verifySignature, extractMessages} from './whatsapp.js';
import {SalesAgent} from './agent.js';
import {PROVIDERS, providerSettings} from './llm.js';

const MAX_BODY = 1024 * 1024;

export function createApp({config, agent, store, log = console}) {
  return async function handler(req, res) {
    const url = new URL(req.url, 'http://localhost');
    try {
      if (req.method === 'GET' && url.pathname === '/health') return send(res, 200, {ok: true});

      if (req.method === 'GET' && url.pathname === '/webhook') {
        const ok = url.searchParams.get('hub.mode') === 'subscribe' && config.verifyToken && url.searchParams.get('hub.verify_token') === config.verifyToken;
        if (!ok) return send(res, 403, 'forbidden');
        res.writeHead(200, {'Content-Type': 'text/plain'});
        return res.end(url.searchParams.get('hub.challenge') ?? '');
      }

      if (req.method === 'POST' && url.pathname === '/webhook') {
        const raw = await readBody(req);
        if (!verifySignature(raw, req.headers['x-hub-signature-256'], config.appSecret)) return send(res, 401, 'invalid signature');
        send(res, 200, 'ok'); // responde rápido; a Meta reenvia se demorar
        let payload;
        try { payload = JSON.parse(raw.toString('utf8')); } catch { return; }
        for (const message of extractMessages(payload, config.phoneNumberId)) agent.enqueue(message);
        return;
      }

      const authorized = () => config.panelToken && req.headers.authorization === `Bearer ${config.panelToken}`;

      if (req.method === 'GET' && url.pathname === '/leads') {
        if (!authorized()) return send(res, 401, 'unauthorized');
        return send(res, 200, await store.listLeads());
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
      if (!res.headersSent) send(res, error.status ?? 500, error.status ? error.message : 'error');
    }
  };
}

function send(res, status, body) {
  const json = typeof body !== 'string';
  res.writeHead(status, {'Content-Type': json ? 'application/json; charset=utf-8' : 'text/plain; charset=utf-8'});
  res.end(json ? JSON.stringify(body) : body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
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
}

async function main() {
  loadDotEnv();
  const config = loadConfig();
  assertReady(config);
  const store = new Store(config.dataDir);
  await store.init();
  const whatsapp = new WhatsAppClient(config);
  const agent = new SalesAgent({config, store, whatsapp});
  http.createServer(createApp({config, agent, store})).listen(config.port, () => {
    console.log(`Agente comercial ouvindo na porta ${config.port}. Webhook: /webhook`);
    store.getSettings().then(s => {
      const name = s.aiProvider || config.aiProvider;
      const p = providerSettings(name);
      console.log(`IA ativa: ${name} (${p.model || 'sem modelo'})${p.ready ? '' : ' — ATENÇÃO: falta chave ou modelo no .env'}`);
    }).catch(() => {});
    if (!config.sellerNumbers.length) console.warn('VENDEDOR_WHATSAPP vazio: os leads encaminhados ficam só em data/leads.json.');
  });
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => { console.error(error.message); process.exit(1); });
}
