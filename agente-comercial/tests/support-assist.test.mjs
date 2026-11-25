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
test('Postgres: só sugere ao responsável, nunca envia; aviso único; resposta humana e transferência cancelam',{skip:!process.env.TEST_DATABASE_URL},async()=>{
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
  const suggestions=async phone=>(await scoped.getEvents(phone)).filter(e=>e.kind==='reply_suggestion');
  // Nada é enviado ao cliente: a HELENA só deixa a sugestão para o responsável.
  const t=await fixture('5511999990001');await service.process(t,agent,counts());await service.process(t,agent,counts());assert.equal(sends,0);assert.equal(generations,1);assert.equal((await root.pool.query('SELECT count(*)::int n FROM user_notifications')).rows[0].n,1);
  const [sug]=await suggestions(t.phone);assert.equal(sug.text,'O sistema permite organizar suas notas pelo navegador.');assert.equal(sug.state,'internal');assert.equal(sug.suggestionFor,t.phone);assert.equal((await scoped.getLead(t.phone)).assignedUserId,owner);
  // Nova mensagem do cliente gera nova sugestão (depois de 1 minuto parado).
  await scoped.recordEvent({id:'more',phone:t.phone,direction:'in',text:'E o preço?',at:new Date(+now-30000).toISOString()});await service.process(t,agent,counts());assert.equal(generations,1,'espera o cliente terminar de escrever');
  clock=new Date(+now+60000);await service.process(t,agent,counts());assert.equal(generations,2);assert.equal((await suggestions(t.phone)).length,2);assert.equal(sends,0);
  clock=now;const early=await fixture('5511999990009',5);await service.process(early,agent,counts());assert.equal((await suggestions(early.phone)).length,1);assert.equal((await root.pool.query('SELECT count(*)::int n FROM user_notifications WHERE phone=$1',[early.phone])).rows[0].n,0,'aviso só aos 15 minutos');
  const t2=await fixture('5511999990002',35);interfere=async()=>scoped.recordEvent({id:'human-reply',phone:t2.phone,direction:'out',actor:'human',text:'Já respondi',at:now.toISOString()});await service.process(t2,agent,counts());assert.equal((await suggestions(t2.phone)).length,0);
  const t3=await fixture('5511999990003',35);interfere=async()=>scoped.updateLead(t3.phone,{assignedUserId:other});await service.process(t3,agent,counts());assert.equal((await suggestions(t3.phone)).length,0);interfere=null;
  const old=await fixture('5511999990005',1500);await service.process(old,agent,counts());assert.equal((await suggestions(old.phone)).length,0);
  const closed=await fixture('5511999990006',35);await scoped.updateLead(closed.phone,{conversationClosed:true});await service.process(closed,agent,counts());assert.equal((await suggestions(closed.phone)).length,0);
  const paused=await fixture('5511999990008',35);hours.supportEnabled=false;await root.pool.query("UPDATE company_handoff_settings SET data=$1 WHERE company_id='default'",[hours]);await service.process(paused,agent,counts());assert.equal((await suggestions(paused.phone)).length,0);
  assert.equal(sends,0);
 }finally{await root.close();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();}
});
