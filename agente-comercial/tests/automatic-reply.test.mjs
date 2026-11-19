import test from 'node:test';
import assert from 'node:assert/strict';
import {isAutomaticReply} from '../server/automatic-reply.js';
import {SalesAgent} from '../server/agent.js';
const away='Agradecemos sua mensagem. Não estamos disponíveis no momento, mas responderemos assim que possível. JCS';
test('aviso automático conservador, preservando perguntas e pedidos humanos',()=>{
 assert.equal(isAutomaticReply(away),true);
 assert.equal(isAutomaticReply('Recebemos sua mensagem. Em breve retornaremos.'),true);
 for(const value of ['Obrigado pelo contato, quero conhecer o sistema.', 'Não estamos disponíveis agora. Qual o preço?', 'Minha mensagem automática não funciona, preciso de ajuda.', 'Obrigado', 'Não estou disponível agora', 'Olá, quero emitir notas'])assert.equal(isAutomaticReply(value),false,value);
});
test('aviso fica no histórico sem IA, agenda ou resposta; webhook repetido é ignorado',async()=>{
 const conv={processedIds:[],histories:{}},events=[];let stopped=0;
 const store={connectionId:'synthetic',listLeads:async()=>({}),getConversation:async()=>conv,recordEvent:async e=>events.push(e),updateLead:async()=>({}),saveConversation:async()=>{}};
 const agent=new SalesAgent({config:{},store,whatsapp:{markRead:async()=>{},sendText:async()=>assert.fail('Não pode responder ao aviso')},cadence:{stop:async()=>stopped++},routing:{intercept:async()=>assert.fail('Não pode encaminhar aviso')},agenda:{intercept:async()=>assert.fail('Não pode interpretar aviso como agenda')}});
 agent.getProvider=async()=>assert.fail('Não precisa chamar IA');
 assert.equal(await agent.handle({id:'automatic-test',from:'synthetic',text:away}),null);
 assert.equal(events.length,1);assert.equal(events[0].text,away);assert.equal(stopped,1);
 assert.equal(await agent.handle({id:'automatic-test',from:'synthetic',text:away}),null);assert.equal(events.length,1);
});
