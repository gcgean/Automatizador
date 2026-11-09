import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {loadConfig} from '../server/config.js';
import {Store} from '../server/store.js';
import {verifySignature, extractMessages} from '../server/whatsapp.js';
import {SalesAgent, TOOLS} from '../server/agent.js';
import {createApp} from '../server/index.js';
import {createProvider} from '../server/llm.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PHONE_ID = '1395892046947138';
const quiet = {log() {}, warn() {}, error() {}};

function payload(messages, phoneNumberId = PHONE_ID) {
  return {object: 'whatsapp_business_account', entry: [{changes: [{field: 'messages', value: {
    metadata: {phone_number_id: phoneNumberId},
    contacts: [{wa_id: '5585999990000', profile: {name: 'Ana'}}],
    messages,
  }}]}]};
}

async function setup(responses, env = {}) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'comercial-'));
  const config = loadConfig({DATA_DIR: dir, ROTEIRO_FILE: path.join(here, '../server/roteiro-comercial.md'), VENDEDOR_WHATSAPP: '55 85 98888-7777', ...env});
  const store = new Store(dir);
  await store.init();
  const sent = [];
  const whatsapp = {sendText: async (to, text) => { sent.push({to, text}); }, markRead: async () => {}};
  const requests = [];
  const client = {beta: {messages: {create: async params => {
    requests.push(structuredClone(params));
    const next = responses.shift();
    if (next instanceof Error) throw next;
    return next;
  }}}};
  const agent = new SalesAgent({config, store, whatsapp, client, log: quiet});
  return {config, store, sent, requests, agent, dir};
}

test('assinatura do webhook', () => {
  const body = Buffer.from('{"a":1}');
  const sig = 'sha256=' + crypto.createHmac('sha256', 'segredo').update(body).digest('hex');
  assert.equal(verifySignature(body, sig, 'segredo'), true);
  assert.equal(verifySignature(body, sig, 'outro'), false);
  assert.equal(verifySignature(body, undefined, 'segredo'), false);
});

test('extrai só mensagens do número comercial', () => {
  const msgs = extractMessages(payload([{id: 'm1', from: '5585999990000', type: 'text', text: {body: 'Oi'}}]), PHONE_ID);
  assert.deepEqual(msgs, [{id: 'm1', from: '5585999990000', name: 'Ana', type: 'text', text: 'Oi'}]);
  assert.deepEqual(extractMessages(payload([{id: 'm2', from: '1', type: 'text', text: {body: 'x'}}], 'numero-suporte'), PHONE_ID), []);
  assert.match(extractMessages(payload([{id: 'm3', from: '1', type: 'audio'}]), PHONE_ID)[0].text, /áudio/);
});

test('ferramentas são estritas e com todos os campos obrigatórios', () => {
  for (const tool of TOOLS) {
    assert.equal(tool.strict, true);
    assert.equal(tool.input_schema.additionalProperties, false);
    assert.deepEqual([...tool.input_schema.required].sort(), Object.keys(tool.input_schema.properties).sort());
  }
});

test('conversa: registra lead, encaminha ao vendedor e responde', async () => {
  const lead = {nome: 'Ana', empresa: 'Mercado Bom', segmento: 'Varejo', cidade: 'Fortaleza', cargo: 'Dona', tamanho: '12 funcionários', sistema_atual: 'Planilhas', dor_principal: 'Controle de estoque', prazo: 'Este mês', email: null, temperatura: 'quente', observacoes: null};
  const {sent, requests, agent, store} = await setup([
    {stop_reason: 'tool_use', content: [{type: 'thinking', thinking: '', signature: 'sig'}, {type: 'tool_use', id: 't1', name: 'registrar_lead', input: lead}, {type: 'tool_use', id: 't2', name: 'encaminhar_para_vendedor', input: {tipo: 'apresentacao', preferencia_horario: 'Quinta à tarde', resumo: 'Varejo com dor de estoque.'}}]},
    {stop_reason: 'end_turn', content: [{type: 'text', text: 'Perfeito, Ana! Um consultor vai te chamar para confirmar quinta à tarde.'}]},
  ]);
  const reply = await agent.enqueue({id: 'w1', from: '5585999990000', name: 'Ana', text: 'Quero ver o sistema quinta à tarde'});
  assert.match(reply, /consultor/);

  const leads = await store.listLeads();
  assert.equal(leads['5585999990000'].status, 'encaminhado');
  assert.equal(leads['5585999990000'].empresa, 'Mercado Bom');
  assert.equal(leads['5585999990000'].email, undefined, 'null não sobrescreve');

  assert.equal(sent.length, 2);
  assert.equal(sent[0].to, '5585988887777');
  assert.match(sent[0].text, /Mercado Bom/);
  assert.equal(sent[1].to, '5585999990000');

  // Segunda chamada recebe o histórico completo, com o raciocínio e os dois resultados numa única mensagem.
  const second = requests[1];
  assert.equal(second.model, 'claude-opus-5-5');
  assert.equal(second.fallbacks, 'default');
  assert.equal(second.messages[1].content[0].type, 'thinking');
  assert.deepEqual(second.messages[2].content.map(b => b.tool_use_id), ['t1', 't2']);
  assert.equal(second.thinking, undefined);
  assert.equal(second.temperature, undefined);
});

test('mensagem repetida do webhook não é respondida duas vezes', async () => {
  const {sent, agent} = await setup([{stop_reason: 'end_turn', content: [{type: 'text', text: 'Olá!'}]}]);
  await agent.enqueue({id: 'dup', from: '5585999990000', name: '', text: 'Oi'});
  await agent.enqueue({id: 'dup', from: '5585999990000', name: '', text: 'Oi'});
  assert.equal(sent.length, 1);
});

test('falha da API: cliente recebe aviso, vendedor é alertado e o histórico continua válido', async () => {
  const {sent, agent, store} = await setup([
    {stop_reason: 'tool_use', content: [{type: 'tool_use', id: 't1', name: 'registrar_lead', input: {nome: 'Ana', empresa: null, segmento: null, cidade: null, cargo: null, tamanho: null, sistema_atual: null, dor_principal: null, prazo: null, email: null, temperatura: null, observacoes: null}}]},
    new Error('overloaded'),
  ]);
  const reply = await agent.enqueue({id: 'x1', from: '5585999990000', name: '', text: 'Oi'});
  assert.match(reply, /consultor/);
  assert.equal(sent.length, 2);
  const conv = await store.getConversation('5585999990000');
  assert.equal(conv.histories.claude.length, 1);
  assert.equal(conv.histories.claude[0].role, 'user');
});

test('DeepSeek/compatível OpenAI: ferramentas, resultado e resposta', async () => {
  const calls = [];
  const replies = [
    {choices: [{message: {role: 'assistant', content: null, reasoning_content: 'Contexto interno sintético de teste.', tool_calls: [{id: 'c1', type: 'function', function: {name: 'registrar_lead', arguments: '{"empresa":"Loja X","temperatura":"morno"}'}}]}}]},
    {choices: [{message: {role: 'assistant', content: 'Legal! Qual o segmento da Loja X?'}}]},
  ];
  const fetchImpl = async (url, init) => {
    calls.push({url, body: JSON.parse(init.body), auth: init.headers.Authorization});
    return {ok: true, json: async () => replies.shift()};
  };
  const env = {DEEPSEEK_API_KEY: 'k', DEEPSEEK_MODEL: 'deepseek-flash'};
  const {sent, agent, store} = await setup([], {AI_PROVIDER: 'deepseek'});
  agent.providerFactory = name => createProvider(name, {env, fetchImpl});

  const reply = await agent.enqueue({id: 'd1', from: '5585999990000', name: 'Rui', text: 'Tenho uma loja'});
  assert.equal(reply, 'Legal! Qual o segmento da Loja X?');
  assert.equal(calls[0].url, 'https://api.deepseek.com/chat/completions');
  assert.equal(calls[0].auth, 'Bearer k');
  assert.equal(calls[0].body.messages[0].role, 'system');
  assert.equal(calls[0].body.tools[0].function.name, 'registrar_lead');
  assert.equal(calls[1].body.messages.find(message => message.role === 'assistant').reasoning_content, 'Contexto interno sintético de teste.');
  assert.ok(!reply.includes('Contexto interno'));
  assert.deepEqual(calls[1].body.messages.at(-1), {role: 'tool', tool_call_id: 'c1', content: 'Lead atualizado. Status: em_conversa.'});
  assert.equal((await store.listLeads())['5585999990000'].empresa, 'Loja X');
  assert.equal(sent.at(-1).text, reply);
  assert.ok((await store.getConversation('5585999990000')).histories.deepseek.length >= 4);
});

test('trocar de IA começa histórico novo com os dados do lead', async () => {
  const {agent, store, requests} = await setup([{stop_reason: 'end_turn', content: [{type: 'text', text: 'Oi de novo!'}]}]);
  await store.updateLead('5585999990000', {empresa: 'Mercado Bom', temperatura: 'quente'});
  const conv = await store.getConversation('5585999990000');
  conv.histories.deepseek = [{role: 'user', content: 'antes'}, {role: 'assistant', content: 'resposta'}];
  await store.saveConversation(conv);

  await store.saveSettings({aiProvider: 'claude'});
  await agent.enqueue({id: 's1', from: '5585999990000', name: '', text: 'Voltei'});
  const first = requests[0].messages[0].content;
  assert.match(first, /Mercado Bom/);
  assert.match(first, /quente/);
  assert.match(first, /Voltei$/);
});

test('/config mostra e troca a IA ativa', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cfg-'));
  const store = new Store(dir);
  await store.init();
  const saved = {...process.env};
  Object.assign(process.env, {DEEPSEEK_API_KEY: 'k'});
  delete process.env.OPENAI_API_KEY;
  const config = loadConfig({PAINEL_TOKEN: 'p', DATA_DIR: dir});
  const server = http.createServer(createApp({config, agent: {enqueue() {}}, store, log: quiet}));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/config`;
  const auth = {authorization: 'Bearer p'};
  try {
    assert.equal((await fetch(base)).status, 401);
    let body = await (await fetch(base, {headers: auth})).json();
    assert.equal(body.provider, 'claude');
    assert.equal(body.disponiveis.deepseek.configurado, true);

    let res = await fetch(base, {method: 'POST', headers: auth, body: JSON.stringify({provider: 'openai'})});
    assert.equal(res.status, 400, 'sem chave não troca');
    res = await fetch(base, {method: 'POST', headers: auth, body: JSON.stringify({provider: 'xyz'})});
    assert.equal(res.status, 400);
    body = await (await fetch(base, {method: 'POST', headers: auth, body: JSON.stringify({provider: 'deepseek'})})).json();
    assert.equal(body.provider, 'deepseek');
    assert.equal((await store.getSettings()).aiProvider, 'deepseek');
  } finally {
    server.close();
    process.env = saved;
  }
});

test('conversa no formato antigo é migrada para o histórico do Claude', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'mig-'));
  const store = new Store(dir);
  await store.init();
  await fs.writeFile(store.convPath('1'), JSON.stringify({phone: '1', messages: [{role: 'user', content: 'oi'}], processedIds: []}));
  const conv = await store.getConversation('1');
  assert.deepEqual(conv.histories.claude, [{role: 'user', content: 'oi'}]);
  assert.equal(conv.messages, undefined);
});

test('webhook HTTP: verificação, assinatura e encaminhamento ao agente', async () => {
  const queued = [];
  const config = loadConfig({WHATSAPP_VERIFY_TOKEN: 'tok', WHATSAPP_APP_SECRET: 'segredo', PAINEL_TOKEN: 'p'});
  const server = http.createServer(createApp({config, agent: {enqueue: m => queued.push(m)}, store: {listLeads: async () => ({a: 1})}, log: quiet}));
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    let res = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=tok&hub.challenge=42`);
    assert.equal(await res.text(), '42');
    res = await fetch(`${base}/webhook?hub.mode=subscribe&hub.verify_token=errado&hub.challenge=42`);
    assert.equal(res.status, 403);

    const body = JSON.stringify(payload([{id: 'h1', from: '5585999990000', type: 'text', text: {body: 'Oi'}}]));
    res = await fetch(`${base}/webhook`, {method: 'POST', body, headers: {'x-hub-signature-256': 'sha256=00'}});
    assert.equal(res.status, 401);
    const sig = 'sha256=' + crypto.createHmac('sha256', 'segredo').update(body).digest('hex');
    res = await fetch(`${base}/webhook`, {method: 'POST', body, headers: {'x-hub-signature-256': sig}});
    assert.equal(res.status, 200);
    assert.equal(queued.length, 1);

    assert.equal((await fetch(`${base}/leads`)).status, 401);
    assert.deepEqual(await (await fetch(`${base}/leads`, {headers: {authorization: 'Bearer p'}})).json(), {a: 1});
  } finally {
    server.close();
  }
});
import {DurableInbox} from '../server/inbox.js';

test('fila persistente deduplica, retoma pendentes e bloqueia conversa com envio incerto', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'inbox-'));
  try {
    const store = new Store(dir);
    await store.init();
    const called = [];
    const agent = {enqueue: async message => { called.push(message.id); if (message.id === 'error') throw new Error('Envio incerto'); }};
    const inbox = new DurableInbox({store, agent, log: quiet});
    await inbox.init();
    await Promise.all([inbox.accept({id:'one',from:'123'}),inbox.accept({id:'one',from:'123'})]);
    await inbox.drain();
    assert.deepEqual(called,['one']);
    await inbox.accept({id:'error',from:'123'});
    await inbox.drain();
    await inbox.accept({id:'later',from:'123'});
    await inbox.drain();
    assert.deepEqual(called,['one','error']);
    const restart = new DurableInbox({store,agent,log:quiet});
    await restart.init();
    restart.resume();
    await restart.drain();
    assert.deepEqual(called,['one','error']);
    const pending = Buffer.from('resume').toString('base64url');
    await restart.update(jobs=>{jobs[pending]={message:{id:'resume',from:'456'},status:'queued'};});
    const recovered = new DurableInbox({store,agent,log:quiet});
    await recovered.init();recovered.resume();await recovered.drain();
    assert.equal(called.at(-1),'resume');
    await recovered.update(jobs=>{jobs[pending].status='processing';});
    const crashed = new DurableInbox({store,agent,log:quiet});
    await crashed.init();assert.equal(crashed.jobs[pending].status,'attention');
  } finally {await fs.rm(dir,{recursive:true,force:true});}
});

test('cliente encaminhado deixa mensagem para humano sem chamar IA',async()=>{
 const {agent,store,sent,requests}=await setup([]);
 await store.updateLead('123',{status:'encaminhado'});
 await agent.enqueue({id:'human',from:'123',name:'Ana',text:'Estou aguardando'});
 assert.equal(requests.length,0);assert.equal(sent.length,0);
 const conversation=await store.getConversation('123');
 assert.equal(conversation.pendingHuman[0].text,'Estou aguardando');
});

test('falha no envio não marca mensagem como processada e rejeita campos internos da IA',async()=>{
 const {agent,store}=await setup([{stop_reason:'end_turn',content:[{type:'text',text:'Olá'}]}]);
 agent.whatsapp.sendText=async()=>{throw new Error('timeout');};
 await assert.rejects(agent.enqueue({id:'failed',from:'123',name:'Ana',text:'Oi'}),/timeout/);
 assert.ok(!(await store.getConversation('123')).processedIds.includes('failed'));
 await assert.rejects(agent.runTool('123','registrar_lead',{status:'encaminhado'}),/inválido/);
});

test('webhook só confirma depois da gravação persistente',async()=>{
 const config=loadConfig({WHATSAPP_APP_SECRET:'secret'});
 const body=JSON.stringify(payload([{id:'persist',from:'123',type:'text',text:{body:'Oi'}}]));
 const signature='sha256='+crypto.createHmac('sha256','secret').update(body).digest('hex');
 const server=http.createServer(createApp({config,store:{},agent:{},inbox:{accept:async()=>{throw new Error('Disco indisponível');}},log:quiet}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try {const response=await fetch('http://127.0.0.1:'+server.address().port+'/webhook',{method:'POST',body,headers:{'x-hub-signature-256':signature}});assert.equal(response.status,500);}
 finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('controles operacionais exigem token e permitem retomar automação e resolver pendência',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'operations-'));
 const store=new Store(dir);await store.init();
 const inbox=new DurableInbox({store,agent:{enqueue:async()=>{}},log:quiet});await inbox.init();
 const key=Buffer.from('uncertain').toString('base64url');
 await inbox.update(jobs=>{jobs[key]={message:{id:'uncertain',from:'123'},status:'attention'};});
 const server=http.createServer(createApp({config:loadConfig({PAINEL_TOKEN:'panel'}),store,inbox,agent:{},log:quiet}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base='http://127.0.0.1:'+server.address().port;
 const post=(route,body)=>fetch(base+route,{method:'POST',headers:{authorization:'Bearer panel'},body:JSON.stringify(body)});
 try{
  assert.equal((await fetch(base+'/inbox')).status,401);
  assert.equal((await post('/leads/123/automation',{enabled:false})).status,200);
  assert.equal((await store.listLeads())['123'].status,'encaminhado');
  assert.equal((await post('/leads/123/automation',{enabled:true})).status,200);
  assert.equal((await store.listLeads())['123'].status,'em_conversa');
  assert.equal((await post('/inbox/resolve',{id:'uncertain',resolution:'handled_manually'})).status,200);
  assert.equal(inbox.jobs[key].status,'done');
  assert.equal((await post('/inbox/resolve',{id:'uncertain',resolution:'handled_manually'})).status,409);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await fs.rm(dir,{recursive:true,force:true});}
});

test('descadastro bloqueia IA e permanece após reiniciar armazenamento', async () => {
  const s = await setup([]);
  try {
    await s.agent.enqueue({id:'stop-1',from:'5511999990000',name:'Ana',text:'Não quero mais receber mensagens'});
    await s.agent.enqueue({id:'stop-2',from:'5511999990000',text:'Oi'});
    assert.equal(s.sent.length,0);
    assert.equal(s.requests.length,0);
    const reopened = new Store(s.dir);
    assert.equal((await reopened.listLeads())['5511999990000'].optedOut,true);
  } finally {await fs.rm(s.dir,{recursive:true,force:true});}
});

test('confirmações fora de ordem não regridem uma mensagem lida', async () => {
  const s = await setup([]);
  try {
    await s.store.recordEvent({id:'event',phone:'5511',direction:'out',text:'Olá',messageId:'wamid-1'});
    await s.store.recordDelivery({id:'wamid-1',status:'read'});
    await s.store.recordDelivery({id:'wamid-1',status:'sent'});
    assert.equal((await s.store.getEvents('5511'))[0].delivery.status,'read');
    assert.equal((await s.store.getEvents('5522')).length,0);
    await Promise.all([s.store.saveSettings({context:'Contexto'}),s.store.saveSettings({aiProvider:'deepseek'})]);
    assert.equal((await s.store.getSettings()).context,'Contexto');
    assert.equal((await s.store.getSettings()).aiProvider,'deepseek');
  } finally {await fs.rm(s.dir,{recursive:true,force:true});}
});

test('envio humano respeita bloqueio e janela encerrada mesmo na fila', async () => {
  const s = await setup([]);
  const from = '5511999990000';
  try {
    await assert.rejects(s.agent.enqueue({id:'human-1',from,text:'Olá',manual:true}),/Janela/);
    await s.store.recordEvent({id:'in-1',phone:from,direction:'in',text:'Olá'});
    await s.agent.enqueue({id:'human-2',from,text:'Resposta humana',manual:true});
    assert.equal(s.sent.length,1);
    await s.agent.enqueue({id:'human-2',from,text:'Resposta humana',manual:true});
    assert.equal(s.sent.length,1);
    await s.store.updateLead(from,{optedOut:true});
    await assert.rejects(s.agent.enqueue({id:'human-3',from,text:'Olá',manual:true}),/bloqueado/);
    assert.equal(s.sent.length,1);
  } finally {await fs.rm(s.dir,{recursive:true,force:true});}
});
