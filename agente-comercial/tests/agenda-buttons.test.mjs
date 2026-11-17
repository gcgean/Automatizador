import test from 'node:test';
import assert from 'node:assert/strict';
import {appointmentOptions} from '../server/agenda.js';
import {WhatsAppClient,extractMessages} from '../server/whatsapp.js';
import {ConnectionRegistry} from '../server/connections.js';

test('gerenciador de conexões encaminha mensagens interativas e bloqueia conexão pausada',async()=>{
 const events=[],calls=[];let enabled=true;
 const scoped={dataDir:'.',loadInbox:async()=>({}),saveInbox:async()=>{},recordEvent:async e=>events.push(e)};
 const registry=new ConnectionRegistry({getConnection:async()=>({}),scope:()=>scoped},{panelOnly:true},{fetchImpl:async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({messages:[{id:'wamid.synthetic'}]})};}});
 registry.configFor=async()=>({enabled,accessToken:'qa',phoneNumberId:'123',graphVersion:'v23.0'});
 const runtime=await registry.runtime('qa');
 await runtime.agent.whatsapp.sendInteractive('5511999900000','Escolha',{type:'button'},{});
 assert.equal(calls[0].type,'interactive');assert.equal(events[1].state,'accepted');
 enabled=false;
 await assert.rejects(runtime.agent.whatsapp.sendInteractive('5511999900000','Escolha',{},{}),/pausada/);
 assert.equal(calls.length,1);
});

test('horários usam botões até três opções e lista acima disso, com IDs estáveis',()=>{
 const slots=Array.from({length:5},(_,i)=>({id:'slot-'+i,data:'2026-11-16',horaInicio:String(9+i).padStart(2,'0')+':00',tecnicoNome:'Apresentador QA'}));
 const buttons=appointmentOptions('offer',slots.slice(0,3));
 assert.equal(buttons.type,'button');assert.equal(buttons.action.buttons.length,3);
 assert.equal(buttons.action.buttons[0].reply.title,'16/11 às 09:00');
 assert.equal(buttons.action.buttons[0].reply.id,'agenda:pick:offer:slot-0');
 const list=appointmentOptions('offer',slots);
 assert.equal(list.type,'list');assert.equal(list.action.sections[0].rows.length,5);
 assert.ok(list.action.sections[0].rows.every(r=>r.title.length<=24&&r.description.length<=72));
});

test('webhook preserva ID de botão e lista sem confiar no título',()=>{
 for(const kind of ['button_reply','list_reply']){
  const payload={entry:[{changes:[{field:'messages',value:{metadata:{phone_number_id:'123'},messages:[{id:'wamid.test',from:'5511999900000',type:'interactive',interactive:{type:kind,[kind]:{id:'agenda:pick:offer:slot',title:'Texto alterado'}}}]}}]}]};
  const [message]=extractMessages(payload,'123');
  assert.equal(message.interactiveReplyId,'agenda:pick:offer:slot');
  assert.equal(message.text,'Texto alterado');
  assert.equal(extractMessages(payload,'456').length,0);
 }
});

test('envio interativo registra aceitação e mantém representação no histórico',async()=>{
 const events=[],calls=[];
 const client=new WhatsAppClient({accessToken:'qa-not-real',phoneNumberId:'123',graphVersion:'v23.0'},async(url,options)=>{calls.push(JSON.parse(options.body));return {ok:true,json:async()=>({messages:[{id:'wamid.qa'}]})};},{recordEvent:async e=>events.push(e)});
 const interactive=appointmentOptions('offer',[{id:'slot',data:'2026-11-16',horaInicio:'09:00',tecnicoNome:'QA'}]);
 await client.sendInteractive('5511999900000','Opções da apresentação',interactive,{actor:'ai',provider:'agenda'});
 assert.equal(calls.length,1);assert.equal(calls[0].type,'interactive');
 assert.deepEqual(calls[0].interactive,interactive);
 assert.deepEqual(events.map(e=>e.state),['sending','accepted']);
 assert.equal(events[1].messageId,'wamid.qa');assert.equal(events[1].text,'Opções da apresentação');
});

test('envio incerto não tenta reenviar como texto',async()=>{
 let count=0;const events=[];
 const client=new WhatsAppClient({accessToken:'qa',phoneNumberId:'123',graphVersion:'v23.0'},async()=>{count++;throw new Error('timeout');},{recordEvent:async e=>events.push(e)});
 await assert.rejects(client.sendInteractive('5511999900000','Escolha',{},{}),/não pôde ser confirmado/);
 assert.equal(count,1);assert.deepEqual(events.map(e=>e.state),['sending','uncertain']);
});
