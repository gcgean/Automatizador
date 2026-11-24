import test from 'node:test';
import assert from 'node:assert/strict';
import {contextualCadenceTemplate,cadenceHistory} from '../server/cadence-context.js';
import {describeTemplate} from '../server/message-templates.js';
const custom=describeTemplate({name:'abertura_personalizada_v1',language:'pt_BR',category:'MARKETING',components:[{type:'BODY',text:'Olá! Aqui é da equipe comercial da Command System.\n\n{{1}}\n\nSe preferir não receber nossas mensagens, é só avisar.',example:{body_text:[['exemplo']]}}]});
const fixed=describeTemplate({name:'atendimento_retorno_cs_v2',language:'pt_BR',category:'MARKETING',components:[{type:'BODY',text:'Olá! Quando puder, responda.'}]});
const events=[{direction:'in',at:'2026-11-22T10:00:00Z',text:'Quero emitir NFC-e na minha loja'},{direction:'out',at:'2026-11-22T10:01:00Z',text:'Te mandei o link do NFC-e.'},{direction:'out',kind:'handoff',text:'interno'}];
const provider=text=>{const calls=[];return {calls,complete:async args=>{calls.push(args);return {text};}};};
test('cadência por contexto: escreve o miolo a partir da conversa e encaixa no modelo de texto livre',async()=>{
 const p=provider('Olá! Tudo bem?\nVi que você abriu o link do NFC-e. Conseguiu começar ou quer que eu te ajude no primeiro passo?');
 const t=await contextualCadenceTemplate({approved:[fixed,custom],events,lead:{produtos_interesse:'NFC-e'},attempt:1,maxAttempts:3,provider:p});
 assert.equal(t.name,'abertura_personalizada_v1');assert.equal(t.contextual,true);
 assert.equal(t.payload.components[0].parameters[0].text,'Vi que você abriu o link do NFC-e. Conseguiu começar ou quer que eu te ajude no primeiro passo?');
 assert.match(t.body,/^Olá! Aqui é da equipe comercial da Command System\.\n\nVi que você abriu o link do NFC-e/);
 assert.deepEqual(p.calls[0].tools,[]);const input=JSON.parse(p.calls[0].messages[0].content);assert.equal(input.conversa.length,2);assert.equal(input.lead.interesse,'NFC-e');assert.match(p.calls[0].system,/só o miolo/);assert.match(p.calls[0].system,/Tentativa 1 de 3/);
 const last=provider('Fico à disposição se quiser retomar o NFC-e. Posso te chamar outro dia?');await contextualCadenceTemplate({approved:[custom],events,lead:{},attempt:3,maxAttempts:3,provider:last});assert.match(last.calls[0].system,/última tentativa/);
});
test('cadência por contexto: sem modelo aprovado, sem conversa ou com resposta ruim volta para os modelos fixos',async()=>{
 const ok=provider('Vi que você quer emitir NFC-e na loja. Posso te mostrar como começar?');
 assert.equal(await contextualCadenceTemplate({approved:[fixed],events,lead:{},attempt:1,maxAttempts:3,provider:ok}),null);assert.equal(ok.calls.length,0);
 assert.equal(await contextualCadenceTemplate({approved:[custom],events:[{direction:'out',text:'oi'}],lead:{},attempt:1,maxAttempts:3,provider:ok}),null);
 for(const text of ['curto','Veja aqui https://exemplo.com e me diga se ajuda com o NFC-e?',''])assert.equal(await contextualCadenceTemplate({approved:[custom],events,lead:{},attempt:1,maxAttempts:3,provider:provider(text)}),null);
 const refused={complete:async()=>({text:'x',refused:true})};assert.equal(await contextualCadenceTemplate({approved:[custom],events,lead:{},attempt:1,maxAttempts:3,provider:refused}),null);
 const same='Olá! Aqui é da equipe comercial da Command System.\n\nVi que você quer emitir NFC-e na loja. Posso te mostrar como começar?\n\nSe preferir não receber nossas mensagens, é só avisar.';
 assert.equal(await contextualCadenceTemplate({approved:[custom],events:[...events,{direction:'out',text:same}],lead:{},attempt:2,maxAttempts:3,provider:ok}),null);
 assert.equal(cadenceHistory(events).length,2);
});
