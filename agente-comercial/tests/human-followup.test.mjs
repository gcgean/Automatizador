import test from 'node:test';import assert from 'node:assert/strict';
import {followupAction,ACK_RE,SCHEDULE_RE} from '../server/human-followup.js';
const H=3600000,norm=s=>s.normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
test('acompanhamento humano: 2h avisa em expediente, nunca devolve à HELENA, horário avisa na hora',()=>{
 const base={open:true,escalated:false,scheduled:false,resumed:false,hasAppointment:false};
 assert.equal(followupAction(null,base),null);
 assert.equal(followupAction({wait:H},base),null);
 assert.equal(followupAction({wait:2*H},base),'escalate');
 assert.equal(followupAction({wait:3*H},{...base,open:false}),null,'fora do expediente espera');
 assert.equal(followupAction({wait:3*H},{...base,escalated:true}),null);
 assert.equal(followupAction({wait:10*60000,schedule:true},base),'schedule');
 assert.equal(followupAction({wait:3*H,schedule:true},{...base,scheduled:true}),'escalate');
 assert.equal(followupAction({wait:25*H},{...base,escalated:true}),null,'a HELENA não reassume sozinha');assert.equal(followupAction({wait:72*H},{...base,escalated:true}),null);
 assert.equal(followupAction({wait:25*H},{...base,escalated:true,hasAppointment:true}),null,'com apresentação agendada não devolve');
 assert.equal(followupAction({wait:25*H},{...base,escalated:true,resumed:true}),null);
});
test('confirmações curtas não contam como espera; pedidos de horário são reconhecidos',()=>{
 for(const t of ['Ok','ok!','Obrigado','👍','Combinado','Valeu'])assert.equal(ACK_RE.test(norm(t)),true,t);
 for(const t of ['Pode sim','10','Quero saber sobre o celular','Mais antes vamos falar de valores'])assert.equal(ACK_RE.test(norm(t)),false,t);
 for(const t of ['Ficamos marcados para amanhã, 14:00h?','Pode ser às 16h','Quero remarcar a reunião','Qual horário?'])assert.equal(SCHEDULE_RE.test(norm(t)),true,t);
 for(const t of ['Quero saber mais sobre o sistema','Ok fico no aguardo'])assert.equal(SCHEDULE_RE.test(norm(t)),false,t);
});
