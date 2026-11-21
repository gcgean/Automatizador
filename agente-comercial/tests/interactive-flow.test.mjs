import {extractMessages} from '../server/whatsapp.js';
import assert from 'node:assert/strict';
import test from 'node:test';
const parse=interactive=>extractMessages({entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'1'},messages:[{id:'test',from:'123',type:'interactive',interactive}]}}]}]},'1');
test('form answers reach conversation text without technical token',()=>{const [m]=parse({type:'nfm_reply',nfm_reply:{response_json:JSON.stringify({flow_token:'hidden',empresa:'Minha empresa',treinamento:false,opcoes:['NF-e','Estoque']})}});assert.match(m.text,/Minha empresa/);assert.match(m.text,/false/);assert.match(m.text,/Estoque/);assert.doesNotMatch(m.text,/hidden|flow_token/);});
test('malformed form and absent content do not invent answers',()=>{assert.match(parse({nfm_reply:{response_json:'broken'}})[0].text,/não vieram/);assert.match(parse({})[0].text,/sem conteúdo/);});
test('buttons, lists and call permission keep existing behavior',()=>{for(const type of ['button_reply','list_reply']){const [m]=parse({[type]:{id:'agenda:pick:123',title:'Minha empresa'}});assert.equal(m.text,'Minha empresa');assert.equal(m.interactiveReplyId,'agenda:pick:123');}assert.equal(parse({type:'call_permission_reply'}).length,0);});
