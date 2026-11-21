import assert from 'node:assert/strict';
import test from 'node:test';
import {PgStore} from '../server/pg-store.js';
import {connectBusinessApp,receiveBusinessApp} from '../server/coexistence.js';

test('cadastro valida o vínculo e salva a credencial só na empresa selecionada',async()=>{
  const calls=[];
  const sector='aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
  const registry={store:{pool:{query:async()=>({rows:[{id:sector}]})}},config:{signupConfigId:'cfg',signupAppId:'12345',signupAppSecret:'secret',connectionsKey:'key',graphVersion:'v23.0'},
    fetch:async(url)=>({ok:true,json:async()=>url.endsWith('/oauth/access_token')?{access_token:'token'}:{data:[{id:'12345',is_on_biz_app:true,display_phone_number:'55555'}]}}),
    list:async()=>[{appId:'12345',wabaId:'54321',webhookMode:'waba_override'}],
    save:(...args)=>calls.push(args)};
  const body={primaryDepartmentId:sector,departmentIds:[sector],phoneNumberId:'12345',wabaId:'54321',code:'code',contextId:'ctx',provider:'deepseek',name:'Comercial'};
  await connectBusinessApp(registry,body,'empresa');
  assert.equal(calls[0][0].webhookMode,'waba_override');
  assert.equal(calls[0][0].accessToken,'token');
  assert.deepEqual(calls[0].slice(1),['empresa',true]);
  await assert.rejects(connectBusinessApp(registry,{...body,phoneNumberId:'99999'},'empresa'),/coexistência/);
  assert.equal(calls.length,1);
});

test('eco assume a conversa uma vez e histórico não abre janela da API',{skip:!process.env.TEST_DATABASE_URL},async()=>{
  const url=new URL(process.env.TEST_DATABASE_URL);
  assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');
  const admin=new PgStore(url.toString(),'.');
  const schema='coexist_'+Date.now();
  await admin.pool.query('CREATE SCHEMA '+schema);
  url.searchParams.set('options','-c search_path='+schema);
  const db=new PgStore(url.toString(),'.');
  const phone='5511999999999';
  const msg={id:'wamid.echo',to:phone,type:'text',text:{body:'Atendimento no celular'},timestamp:'1800000000'};
  const payload=(field,value)=>({entry:[{changes:[{field,value:{metadata:{phone_number_id:'12345'},...value}}]}]});
  try {
    await db.init();
    const echo=payload('smb_message_echoes',{message_echoes:[msg]});
    await receiveBusinessApp(db,echo,'54321');
    assert.equal((await db.getEvents(phone)).length,0);
    await receiveBusinessApp(db,echo,'12345');
    assert.equal((await db.getLead(phone)).status,'encaminhado');
    await db.updateLead(phone,{status:'em_conversa'});
    await receiveBusinessApp(db,echo,'12345');
    assert.equal((await db.getLead(phone)).status,'em_conversa');
    const history=payload('history',{history:[{threads:[{id:phone,messages:[{...msg,id:'wamid.old',from:phone}]}]}]});
    await receiveBusinessApp(db,history,'12345');
    await receiveBusinessApp(db,history,'12345');
    assert.equal((await db.getEvents(phone)).length,1);
    assert.equal((await db.conversationEvents(phone)).length,2);
  } finally {await db.close();await admin.pool.query('DROP SCHEMA '+schema+' CASCADE');await admin.close();}
});
