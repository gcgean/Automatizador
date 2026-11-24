// Casos tirados da varredura das conversas abertas (24/11/2026).
import test from 'node:test';import assert from 'node:assert/strict';
import {claimsAppointment} from '../server/agenda.js';
import {immediateSalesIntent} from '../server/commercial-growth.js';
test('trava de agendamento: "até lá" sem reserva conta como confirmação',()=>{
 assert.equal(claimsAppointment('Prontinho, Patrícia! Qualquer dúvida até lá, é só me chamar. 🙂'),true);
 assert.equal(claimsAppointment('Até lá, qualquer coisa me chama.'),true);
 assert.equal(claimsAppointment('Quer que eu veja horários para a equipe te mostrar como funciona?'),false);
 assert.equal(claimsAppointment('Lá no sistema você emite pelo celular.'),false);
});
test('pedido para falar com o comercial é pedido de pessoa',()=>{
 for(const t of ['Olá! Vim pelo site do Cilos CRM e quero falar com o comercial.','Quero falar com alguém da equipe','Preciso falar com o vendedor','Posso falar com o comercial?','Gostaria de falar com a equipe comercial'])assert.equal(immediateSalesIntent(t),true,t);
 for(const t of ['Não quero falar com o comercial','Quero falar com o comercial amanhã','Ela disse que quer falar com o vendedor'])assert.equal(immediateSalesIntent(t),false,t);
});
