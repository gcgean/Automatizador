import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {Pool} from 'pg';
import {SupportAssist,waitingTurn} from '../server/support-assist.js';import {PgStore} from '../server/pg-store.js';import {ConsultantRouting} from '../server/consultant-routing.js';
const now=new Date('2026-11-20T14:00:00Z'),ago=m=>new Date(+now-m*60000).toISOString();
test('espera parte da primeira mensagem, ignora stories, preserva janela e cancela com resposta humana',()=>{
 const events=[{id:'a',direction:'in',text:'Preciso de ajuda',at:ago(35)},{id:'b',direction:'in',text:'Olá?',at:ago(2)}];
 assert.equal(waitingTurn(events,now).wait,35*60000);assert.equal(waitingTurn(events,now).canSend,true);
 assert.equal(waitingTurn([...events,{id:'c',direction:'out',actor:'human',at:ago(1)}],now),null);
 assert.equal(waitingTurn([{id:'story',direction:'in',text:'[Resposta ao seu story] oi',at:ago(35)}],now),null);
 assert.equal(waitingTurn([{...events[0],at:ago(1500)}],now).canSend,false);
 assert.equal(waitingTurn([...events,{id:'support',direction:'out',kind:'support_assist',at:ago(1)}],now).anchor,'a');
});
test('Postgres: aviso único, apoio único 24h inclusive feriado, resposta durante geração e transferência cancelam',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');
 const db=new Pool({connectionString:url.toString()}),schema='support_'+crypto.randomBytes(8).toString('hex');await db.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);
 const root=new PgStore(url.toString(),'.');let clock=now;
 try{
  await root.init();const scoped=root.scope('default'),owner=crypto.randomUUID(),other=crypto.randomUUID();
  for(const id of [owner,other])await root.pool.query("INSERT INTO users(id,email,name,role,company_id,active) VALUES($1,$2,'Teste','operator','default',true)",[id,id+'@test.invalid']);
  await root.pool.query("UPDATE whatsapp_connections SET enabled=true WHERE id='default'");
  const hours={enabled:false,supportEnabled:true,timezone:'America/Fortaleza',days:Array.from({length:7},()=>[{start:'00:00',end:'23:59'}]),holidays:[]};
  await root.pool.query("INSERT INTO company_handoff_settings(company_id,data) VALUES('default',$1)",[hours]);
  const registry={routing:new ConsultantRouting(root)},service=new SupportAssist(root,registry,{now:()=>clock});await service.init();
  let sends=0,generations=0,interfere=null;
  const agent={queues:new Map(),getProvider:async()=>({complete:async()=>{generations++;if(interfere)await interfere();return {text:'O sistema permite organizar suas notas pelo navegador.'};}}),whatsapp:{sendText:async(phone,text,meta)=>{sends++;await scoped.recordEvent({id:crypto.randomUUID(),phone,direction:'out',text,state:'accepted',at:clock.toISOString(),...meta});}}};
  registry.runtime=async()=>({agent});
  async function fixture(phone,minutes=16){await scoped.updateLead(phone,{status:'encaminhado',assignedUserId:owner});await root.pool.query('UPDATE service_tickets SET opened_at=$2 WHERE phone=$1',[phone,ago(3000)]);await scoped.recordEvent({id:phone,phone,direction:'in',text:'Como funciona?',at:ago(minutes)});return (await root.pool.query('SELECT * FROM service_tickets WHERE phone=$1 AND closed_at IS NULL',[phone])).rows[0];}
  const counts=()=>({checked:0,notified:0,sent:0,skipped:0,errors:0});
  const t=await fixture('5511999990001');await service.process(t,agent,counts());await service.process(t,agent,counts());assert.equal(sends,0);assert.equal((await root.pool.query('SELECT count(*)::int n FROM user_notifications')).rows[0].n,1);
  clock=new Date(+now+15*60000);await service.process(t,agent,counts());await service.process(t,agent,counts());assert.equal(sends,1);assert.equal(generations,1);assert.equal((await scoped.getLead(t.phone)).assignedUserId,owner);
  clock=now;const t2=await fixture('5511999990002',35);interfere=async()=>scoped.recordEvent({id:'human-reply',phone:t2.phone,direction:'out',actor:'human',text:'Já respondi',at:now.toISOString()});await service.process(t2,agent,counts());assert.equal(sends,1);
  const t3=await fixture('5511999990003',35);interfere=async()=>scoped.updateLead(t3.phone,{assignedUserId:other});await service.process(t3,agent,counts());assert.equal(sends,1);interfere=null;
  hours.holidays=[{date:'2026-11-20',name:'Feriado'}];await root.pool.query("UPDATE company_handoff_settings SET data=$1 WHERE company_id='default'",[hours]);
  const noticesBefore=(await root.pool.query('SELECT count(*)::int n FROM user_notifications')).rows[0].n; const t4=await fixture('5511999990004',35);await service.process(t4,agent,counts());assert.equal(sends,2);assert.equal((await root.pool.query('SELECT count(*)::int n FROM user_notifications')).rows[0].n,noticesBefore);assert.equal((await scoped.getEvents(t4.phone)).at(-1).text,'O sistema permite organizar suas notas pelo navegador.');assert.equal((await scoped.getEvents(t4.phone)).at(-1).signed,false);
  const old=await fixture('5511999990005',1500);await service.process(old,agent,counts());assert.equal(sends,2);
  const closed=await fixture('5511999990006',35);await scoped.updateLead(closed.phone,{conversationClosed:true});await service.process(closed,agent,counts());assert.equal(sends,2);

  const uncertain=await fixture('5511999990007',35);let attempts=0;const failing={...agent,whatsapp:{sendText:async()=>{attempts++;throw Error('timeout');}}};
  await assert.rejects(service.process(uncertain,failing,counts()),/timeout/);await service.process(uncertain,failing,counts());assert.equal(attempts,1);
  assert.equal((await root.pool.query('SELECT status FROM support_assist_cycles WHERE ticket_id=$1',[uncertain.id])).rows[0].status,'uncertain');
  const paused=await fixture('5511999990008',35);hours.supportEnabled=false;await root.pool.query("UPDATE company_handoff_settings SET data=$1 WHERE company_id='default'",[hours]);await service.process(paused,agent,counts());assert.equal(sends,2);
 }finally{await root.close();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();}
});
