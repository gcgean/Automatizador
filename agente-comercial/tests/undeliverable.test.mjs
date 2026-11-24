import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';import {isUndeliverable,markUndeliverable,clearUndeliverable,UNDELIVERABLE_MESSAGE} from '../server/undeliverable.js';import {CadenceService} from '../server/cadence.js';
test('131026: só falha com esse código marca o número',()=>{
 assert.equal(isUndeliverable({status:'failed',errors:[{code:131026}]}),true);
 assert.equal(isUndeliverable({status:'failed',errors:[{code:131049}]}),false);
 assert.equal(isUndeliverable({status:'delivered'}),false);
 assert.match(UNDELIVERABLE_MESSAGE,/Confirme o número/);
 assert.equal(new CadenceService(null,{}).allowed({status:'em_conversa',undeliverableNumber:true}),false);
});
test('131026: marca o contato, para a cadência e libera quando o cliente escreve',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');const db=new Pool({connectionString:url.toString()}),schema='undeliv_'+crypto.randomBytes(6).toString('hex');await db.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const root=new PgStore(url.toString(),'.');
 try{await root.init();const store=root.scope('default'),phone='558892703029';
  await store.updateLead(phone,{nome:'Contato sintético'});
  await store.recordEvent({id:'out-1',phone,direction:'out',actor:'human',text:'Olá',messageId:'wamid.fail-1',state:'accepted'});
  await root.pool.query("INSERT INTO cadence_queue(connection_id,phone,cycle_id,inbound_id,question,status,next_at,preferred_time,reason) VALUES('default',$1,$2,'x','q','waiting',now(),'10:00','Cliente sem resposta')",[phone,crypto.randomUUID()]);
  assert.equal(await markUndeliverable(store,{id:'wamid.fail-1',status:'failed',errors:[{code:131049}]}),false);
  assert.equal(await markUndeliverable(store,{id:'wamid.unknown',status:'failed',errors:[{code:131026}]}),false);
  assert.equal(await markUndeliverable(store,{id:'wamid.fail-1',status:'failed',errors:[{code:131026}]}),true);
  const lead=await store.getLead(phone);assert.equal(lead.undeliverableNumber,true);assert.equal(lead.undeliverableCode,131026);
  assert.equal((await root.pool.query('SELECT status FROM cadence_queue WHERE phone=$1',[phone])).rows[0].status,'stopped');
  assert.equal(await markUndeliverable(store,{id:'wamid.fail-1',status:'failed',errors:[{code:131026}]}),false,'não marca de novo');
  assert.equal(await clearUndeliverable(store,phone),true);assert.equal((await store.getLead(phone)).undeliverableNumber,false);assert.equal(await clearUndeliverable(store,phone),false);
 }finally{await root.close();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();}
});
