import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';
import {CommercialGrowth} from '../server/commercial-growth.js';
import {notifyOptIn} from '../server/telegram-alerts.js';
import {ALERT_TYPES,defaultKinds,recipientKinds,alertLabel} from '../shared/alert-types.js';

test('catálogo: todo tipo tem rótulo, padrões por perfil e vínculos antigos usam o padrão',()=>{
 for(const a of ALERT_TYPES){assert.ok(a.label&&a.hint&&a.group,a.id);assert.ok(a.telegram||a.id==='page_request',a.id);}
 assert.ok(defaultKinds(true).includes('sales_overdue'));assert.ok(!defaultKinds(false).includes('sales_overdue'));assert.ok(defaultKinds(false).includes('link_sent'));
 assert.deepEqual(recipientKinds({manager:false,kinds:null}),defaultKinds(false));assert.deepEqual(recipientKinds({kinds:['assignment','inexistente']}),['assignment']);
 assert.equal(alertLabel('client_waiting'),'Cliente esperando há 2 horas');
});

test('Telegram: vínculo por link, alertas escolhidos por pessoa, teste e tipos opcionais',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');const db=new Pool({connectionString:url.toString()}),schema='tg_'+crypto.randomBytes(8).toString('hex');await db.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const store=new PgStore(url.toString(),'.');
 // Telegram falso: registra envios e devolve as mensagens "recebidas" pelo bot.
 const sent=[],inbox=[];let updateId=100;
 const fetchImpl=async(u,opt)=>{const method=u.split('/').pop(),body=JSON.parse(opt.body||'{}');let result;
  if(method==='getMe')result={username:'qa_alertas_bot'};else if(method==='getUpdates'){result=inbox.filter(x=>!body.offset||x.update_id>=body.offset);}else if(method==='sendMessage'){sent.push(body);result={message_id:sent.length};}
  return {ok:true,json:async()=>({ok:true,result})};};
 try{
  await store.init();await store.pool.query("UPDATE whatsapp_connections SET enabled=true WHERE id='default'");
  const growth=new CommercialGrowth(store,{publicUrl:'https://sales.example.com',connectionsKey:'a'.repeat(64)},{fetchImpl});await growth.init();
  const admin={id:crypto.randomUUID(),role:'admin',company_id:'default'},seller=crypto.randomUUID();
  await store.pool.query("INSERT INTO users(id,email,name,role,company_id) VALUES($1,'gestor@qa.test','Gestora QA','admin','default'),($2,'vendedor@qa.test','Vendedor QA','operator','default')",[admin.id,seller]);
  await store.pool.query('INSERT INTO user_connections(user_id,connection_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[seller,'default']).catch(()=>{});
  await assert.rejects(growth.saveTelegram(admin,{action:'link',userId:seller}),/token do bot/);
  let st=await growth.saveTelegram(admin,{token:'123456:'+'A'.repeat(35),enabled:true});assert.equal(st.botUsername,'qa_alertas_bot');assert.equal(st.configured,true);
  // Link de vínculo: a pessoa toca em Iniciar e o chat é gravado sem digitar Chat ID.
  st=await growth.saveTelegram(admin,{action:'link',userId:seller});const code=new URL(st.link.url).searchParams.get('start');assert.match(st.link.url,/^https:\/\/t\.me\/qa_alertas_bot\?start=/);assert.equal(st.pending.length,1);
  inbox.push({update_id:++updateId,message:{text:'/start codigo-falso-123',chat:{id:555,type:'private'}}},{update_id:++updateId,message:{text:'/start '+code,chat:{id:777001,type:'private'}}});
  st=await growth.saveTelegram(admin,{action:'check'});assert.equal(st.pending.length,0);
  const r=st.recipients.find(x=>x.user_id===seller);assert.ok(r);assert.deepEqual(r.kinds,defaultKinds(false));assert.ok(!JSON.stringify(st).includes('777001'),'status não expõe o chat');
  assert.match(sent.find(m=>m.chat_id===555).text,/expirou/);assert.match(sent.find(m=>m.chat_id===777001).text,/Pronto, Vendedor/);
  // O mesmo código não serve de novo; offset avança.
  await growth.saveTelegram(admin,{action:'check'});assert.equal((await store.pool.query('SELECT update_offset FROM commercial_telegram')).rows[0].update_offset,String(updateId+1));
  // Escolha de alertas por pessoa.
  await assert.rejects(growth.saveTelegram(admin,{action:'kinds',userId:seller,kinds:['nao_existe']}),/inválidos/);
  st=await growth.saveTelegram(admin,{action:'kinds',userId:seller,kinds:['schedule_request','reply_suggestion']});assert.deepEqual(st.recipients.find(x=>x.user_id===seller).kinds,['schedule_request','reply_suggestion']);
  // Entrega: só os tipos escolhidos chegam.
  const phone='5511999900555';await store.scope('default').updateLead(phone,{nome:'Cliente QA',assignedUserId:seller,status:'encaminhado'});
  for(const kind of ['client_waiting','schedule_request'])await store.pool.query('INSERT INTO user_notifications(id,user_id,company_id,connection_id,phone,kind) VALUES($1,$2,$3,$4,$5,$6)',[crypto.randomUUID(),seller,'default','default',phone,kind]);
  const before=sent.length;await growth.telegramTick();const delivered=sent.slice(before).filter(m=>m.chat_id==='777001');
  assert.equal(delivered.length,1);assert.match(delivered[0].text,/horário/);
  // Tipo opcional: só gera aviso para quem escolheu.
  assert.equal(await notifyOptIn(store.pool,{companyId:'default',connectionId:'default',phone,kind:'reply_suggestion'}),1);
  assert.equal(await notifyOptIn(store.pool,{companyId:'default',connectionId:'default',phone,kind:'lead_discarded'}),0);
  // Teste manual e desvínculo.
  st=await growth.saveTelegram(admin,{action:'test',userId:seller});assert.equal(st.tested,true);assert.match(sent.at(-1).text,/Teste de alerta/);
  st=await growth.saveTelegram(admin,{enabled:true,userId:seller,remove:true});assert.equal(st.recipients.length,0);
  await assert.rejects(growth.saveTelegram({...admin,role:'operator'},{action:'link',userId:seller}),/administradores/);
 }finally{await store.pool.end();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();}
});
