import test from 'node:test';import assert from 'node:assert/strict';import {selectCadenceTemplate} from '../server/cadence.js';
const templates=[{name:'a',language:'pt_BR',body:'Qual sua necessidade?'},{name:'b',language:'pt_BR',body:'Ficou alguma dúvida?'},{name:'c',language:'pt_BR',body:'Vamos encerrar por enquanto.'}],sequence=templates.map(({name,language})=>({name,language}));
test('segue ordem, não repete conteúdo e aguarda aprovação sem pular etapas',()=>{
 const events=[{direction:'in',text:'Olá'}];assert.equal(selectCadenceTemplate(templates,sequence,events).name,'a');
 events.push({direction:'out',text:'QUAL SUA NECESSIDADE!'});assert.equal(selectCadenceTemplate(templates,sequence,events).name,'b');
 assert.equal(selectCadenceTemplate([templates[0],templates[2]],sequence,events),undefined);
 events.push({direction:'out',text:templates[1].body},{direction:'out',text:templates[2].body});assert.equal(selectCadenceTemplate(templates,sequence,events),undefined);
 events.push({direction:'in',text:'Voltei'});assert.equal(selectCadenceTemplate(templates,sequence,events).name,'a');
});
test('nomes diferentes com o mesmo texto não contornam a proteção',()=>{const duplicate={...templates[0],name:'duplicate'};assert.equal(selectCadenceTemplate([...templates,duplicate],[{name:'duplicate',language:'pt_BR'}],[{direction:'out',text:templates[0].body}]),undefined);});
