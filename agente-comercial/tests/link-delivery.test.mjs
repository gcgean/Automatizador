import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';
import {CommercialGrowth} from '../server/commercial-growth.js';
import {splitLinks} from '../server/message-split.js';

test('link vai em mensagem separada, sem sobras curtas',()=>{
 assert.deepEqual(splitLinks('Aqui está a página da solução para oficina:\nhttps://commandweb.net/oficina\n\nNela você confere os recursos. Depois me conta!'),['Aqui está a página da solução para oficina:','https://commandweb.net/oficina','Nela você confere os recursos. Depois me conta!']);
 assert.deepEqual(splitLinks('Só texto, sem link.'),['Só texto, sem link.']);
 assert.deepEqual(splitLinks('https://commandweb.net/cte'),['https://commandweb.net/cte']);
 assert.deepEqual(splitLinks('Conheça: https://commandweb.net/cte e https://commandweb.net/mdfe. Qualquer dúvida, me chame.'),['Conheça:','https://commandweb.net/cte','https://commandweb.net/mdfe','Qualquer dúvida, me chame.']);
 assert.deepEqual(splitLinks('Veja https://commandweb.net/oficina.'),['Veja','https://commandweb.net/oficina']);
});

const OPEN={enabled:true,timezone:'America/Sao_Paulo',holidays:[],days:Array.from({length:7},()=>[{start:'00:00',end:'23:59'}])};
const CLOSED={...OPEN,days:Array.from({length:7},()=>[])};

test('cliente recebe o endereço oficial; envio registrado e vendedores avisados só em horário comercial',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');const db=new Pool({connectionString:url.toString()}),schema='links_'+crypto.randomBytes(8).toString('hex');await db.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const store=new PgStore(url.toString(),'.');
 try{
  await store.init();await store.pool.query("INSERT INTO context_profiles(id,name,body,company_id) VALUES('default','Synthetic','Command Server','default') ON CONFLICT DO NOTHING");await store.pool.query("UPDATE whatsapp_connections SET enabled=true,context_id='default' WHERE id='default'");
  let hours=OPEN;const growth=new CommercialGrowth(store,{publicUrl:'https://sales.example.com',connectionsKey:'a'.repeat(64)});await growth.init();growth.bind({routing:{settings:async()=>hours}});
  const seller=crypto.randomUUID(),manager=crypto.randomUUID();
  for(const [id,role,mgr] of [[seller,'operator',false],[manager,'admin',true]]){await store.pool.query("INSERT INTO users(id,email,name,role) VALUES($1,$2,'QA','"+role+"')",[id,id+'@qa.test']);await store.pool.query('INSERT INTO commercial_telegram_recipients(company_id,user_id,chat_cipher,manager) VALUES($1,$2,$3,$4)',['default',id,'x',mgr]);}
  const p=(await growth.products('default')).find(p=>p.id==='oficina'),phone='5511999900777';await store.updateLead(phone,{nome:'Contato fictício'});
  const link=await growth.makeLink('default',phone,p);assert.equal(link.url,'https://commandweb.net/oficina');assert.ok(link.direct);
  // O link antigo de rastreio continua funcionando para quem já recebeu.
  assert.match(await growth.redirect(link.token),/^https:\/\/commandweb\.net\/oficina\?commercial_ref=/);
  const reply='Aqui está a página da solução para oficina:\n'+link.url+'\n\nDepois me conta!';
  await growth.recordLinksSent('default',phone,reply);await growth.recordLinksSent('default',phone,reply);
  const sent=(await store.pool.query("SELECT event_id FROM commercial_events WHERE phone=$1 AND kind='link_sent'",[phone])).rows;assert.deepEqual(sent.map(r=>r.event_id),['sent:'+link.token]);
  const notes=(await store.pool.query("SELECT user_id FROM user_notifications WHERE phone=$1 AND kind='link_sent'",[phone])).rows;assert.deepEqual(notes.map(r=>r.user_id),[seller]);
  // Mesmo link já enviado: a cadência não manda de novo.
  assert.equal(await growth.cadenceTemplate('default',phone,[{name:p.templateName,language:'pt_BR',body:'Conheça: {{1}}'}],[{direction:'out',text:reply}]),null);
  // Fora do horário comercial: registra o envio, mas não avisa.
  hours=CLOSED;const other='5511999900776';await store.updateLead(other,{nome:'Outro contato'});const l2=await growth.makeLink('default',other,p);await growth.recordLinksSent('default',other,'Veja: '+l2.url);
  assert.equal((await store.pool.query("SELECT count(*)::int n FROM commercial_events WHERE phone=$1 AND kind='link_sent'",[other])).rows[0].n,1);
  assert.equal((await store.pool.query("SELECT count(*)::int n FROM user_notifications WHERE phone=$1",[other])).rows[0].n,0);
  // Lead com responsável: só ele é avisado.
  hours=OPEN;const owned='5511999900775';await store.updateLead(owned,{nome:'Com responsável',assignedUserId:manager});const l3=await growth.makeLink('default',owned,p);await growth.recordLinksSent('default',owned,l3.url);
  assert.deepEqual((await store.pool.query("SELECT user_id FROM user_notifications WHERE phone=$1",[owned])).rows.map(r=>r.user_id),[manager]);
 }finally{await store.pool.end();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();}
});
