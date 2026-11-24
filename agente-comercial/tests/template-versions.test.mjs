import test from 'node:test';import assert from 'node:assert/strict';
import {latestTemplates,sameTemplate,templateBase} from '../server/template-versions.js';
import {selectCadenceTemplate} from '../server/cadence.js';
import {customOpeningTemplate} from '../server/ticket-opening.js';
import {contextualCadenceTemplate} from '../server/cadence-context.js';
test('versão nova aprovada substitui a antiga; sem versão nova, nada muda',()=>{
 const t=(name,body='Olá!',language='pt_BR')=>({name,language,body});
 const list=[t('command_conversa_oficina_v1','Aqui é da Command'),t('command_conversa_oficina_v2','Aqui é a HELENA'),t('atendimento_retorno_cs_v2'),t('atendimento_retorno_cs_v3','Aqui é a HELENA, tudo bem?'),t('lembrete_apresentacao_30min_v1'),t('hello_world'),t('command_conversa_oficina_v1','en','en_US')];
 assert.deepEqual(latestTemplates(list).map(x=>x.name+'|'+x.language),['command_conversa_oficina_v2|pt_BR','atendimento_retorno_cs_v3|pt_BR','lembrete_apresentacao_30min_v1|pt_BR','hello_world|pt_BR','command_conversa_oficina_v1|en_US']);
 assert.equal(templateBase('cadencia_comercial_abordagem_1_v2'),'cadencia_comercial_abordagem_1');
 assert.equal(sameTemplate({name:'atendimento_retorno_cs_v3',language:'pt_BR'},'atendimento_retorno_cs_v2','pt_BR'),true);
 assert.equal(sameTemplate({name:'atendimento_retorno_cs_v3',language:'pt_BR'},'atendimento_retorno_cilos_v2','pt_BR'),false);
 // A sequência salva com o nome antigo passa a enviar a versão nova.
 const picked=selectCadenceTemplate(latestTemplates(list),[{name:'atendimento_retorno_cs_v2',language:'pt_BR'}],[{direction:'in',text:'oi'}]);
 assert.equal(picked.name,'atendimento_retorno_cs_v3');
});
test('modelo de texto livre: aceita o formato da cadência e prefere a versão mais nova',async()=>{
 const v1={name:'abertura_personalizada_v1',language:'pt_BR',body:'Olá! Aqui é da equipe comercial da Command System.\n\n{{1}}\n\nSe preferir não receber nossas mensagens, é só avisar.'};
 const v2={name:'abertura_personalizada_v2',language:'pt_BR',body:'Olá! Aqui é a HELENA, da Command System.\n\n{{1}}\n\nSe preferir não receber nossas mensagens, é só avisar.'};
 assert.equal(customOpeningTemplate([v1]).name,'abertura_personalizada_v1');
 assert.equal(customOpeningTemplate([v1,v2]).name,'abertura_personalizada_v2');
 assert.equal(customOpeningTemplate([{...v2,body:'Olá {{1}} e {{2}}'}]),null);
 const events=[{direction:'in',at:'2026-11-22T10:00:00Z',text:'Quero emitir NFC-e'}];
 const written=await contextualCadenceTemplate({approved:[v2],events,lead:{},attempt:1,maxAttempts:3,provider:{complete:async()=>({text:'Vi que você quer emitir NFC-e. Posso te ajudar no primeiro passo?'})}});
 assert.equal(written.name,'abertura_personalizada_v2');assert.match(written.body,/^Olá! Aqui é a HELENA, da Command System\.\n\nVi que você quer emitir NFC-e/);
});
