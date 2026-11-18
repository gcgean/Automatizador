import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';import {Contacts,normalizePhone,phoneVariants} from '../server/contacts.js';import {SalesAgent} from '../server/agent.js';
import {listAttendances} from '../server/tickets.js';

test('telefone: DDI, DDD e variação do nono dígito',()=>{
 assert.equal(normalizePhone('(88) 99999-0001'),'5588999990001');
 assert.equal(normalizePhone('+55 88 9999-0001'),'558899990001');
 assert.equal(normalizePhone('088 99999-0001'),'5588999990001');
 assert.equal(normalizePhone('0055 11 98888-7777'),'5511988887777');
 assert.equal(normalizePhone('+351 912 345 678'),'351912345678');
 assert.equal(normalizePhone('12345'),null);assert.equal(normalizePhone(''),null);
 assert.deepEqual(phoneVariants('5588999990001').sort(),['558899990001','5588999990001'].sort());
 assert.deepEqual(phoneVariants('558899990001').sort(),['558899990001','5588999990001'].sort());
});

test('contatos: salvar, importar, renomear, abrir chamado e nome protegido da IA',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');const db=new Pool({connectionString:url.toString()}),schema='contacts_'+crypto.randomBytes(8).toString('hex');await db.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const root=new PgStore(url.toString(),'.');
 try{
  await root.init();const contacts=new Contacts(root),store=root.scope('default'),user={id:crypto.randomUUID(),name:'Op',role:'admin'},connections=[{id:'default',name:'Comercial',color:'#2563eb'}];
  await root.pool.query("INSERT INTO users(id,email,name,role) VALUES($1,'op@qa.test','Op','admin')",[user.id]);
  // Salvar: cria sem chamado; o mesmo número sem o 9 reaproveita o contato.
  let r=await contacts.save('default',{phone:'(88) 99999-0001',name:'  Maria   Souza ',company:'Loja M'},user);
  assert.equal(r.created,true);assert.equal(r.phone,'5588999990001');assert.equal(r.lead.nome,'Maria Souza');assert.equal(r.lead.conversationClosed,true);
  assert.equal((await root.pool.query('SELECT count(*)::int n FROM service_tickets WHERE phone=$1',[r.phone])).rows[0].n,0,'salvar não abre chamado');
  await store.updateLead('558877776666',{nomeWhatsApp:'Zé WhatsApp'});
  r=await contacts.save('default',{phone:'88 9 7777-6666',name:'José Lima'},user);assert.equal(r.created,false);assert.equal(r.phone,'558877776666');
  await assert.rejects(contacts.save('default',{phone:'123',name:'X'},user),/telefone/);
  await assert.rejects(contacts.save('default',{phone:'88999990009',name:'  '},user),/nome/);
  // Importar: novos entram, quem já tem nome fica, inválidos e repetidos contam como ignorados.
  const imported=await contacts.import('default',[{name:'Novo Um',phone:'88 98888-1111'},{name:'Outro nome',phone:'5588999990001'},{name:'Sem fone',phone:''},{name:'Novo Um repetido',phone:'(88) 98888-1111'},{name:'Sem nome antes',phone:'85 97777-2222'}],user);
  await store.updateLead('5585977772222',{nomeWhatsApp:'wa'});
  assert.deepEqual(imported,{created:2,named:0,unchanged:1,invalid:2});
  assert.equal((await store.getLead('5588999990001')).nome,'Maria Souza');
  await assert.rejects(contacts.import('default',[],user),/Nenhum/);
  // Lista com busca por nome e por telefone; contatos novos aparecem como sem conversa.
  let list=await contacts.list(user,connections,{q:'maria'});assert.deepEqual(list.items.map(c=>[c.name,c.company,c.hasOpenTicket,c.messages]),[['Maria Souza','Loja M',false,0]]);
  list=await contacts.list(user,connections,{q:'98888'});assert.equal(list.items[0].name,'Novo Um');
  assert.equal((await contacts.list(user,connections,{})).items.length,4);
  assert.equal((await contacts.list(user,[],{})).items.length,0);
  // Renomear.
  assert.equal((await contacts.rename('default','5588988881111','Novo Nome',user)).nome,'Novo Nome');
  await assert.rejects(contacts.rename('default','5500000000000','X',user),/não encontrado/);
  // Abrir chamado: contato salvo vira chamado aberto visível em Atendimentos.
  assert.equal((await listAttendances(store,user)).some(a=>a.telefone==='5588999990001'),false);
  const opened=await contacts.open('default','5588999990001',user,{});assert.equal(opened.conversationClosed,false);
  const attendances=await listAttendances(store,user);assert.ok(attendances.some(a=>a.telefone==='5588999990001'&&!a.conversationClosed),'aparece em Atendimentos');
  assert.equal((await contacts.list(user,connections,{q:'maria'})).items[0].hasOpenTicket,true);
  // Contato aberto e nunca finalizado (ex.: importado antes) também passa a aparecer.
  await store.updateLead('5511966665555',{nomeWhatsApp:'Antigo'});
  await contacts.open('default','5511966665555',user,{});assert.ok((await listAttendances(store,user)).some(a=>a.telefone==='5511966665555'));
  // A IA não troca o nome definido pela equipe, mas grava os outros dados.
  const agent=new SalesAgent({config:{aiProvider:'deepseek',sellerNumbers:[]},store,whatsapp:{}});
  await agent.runTool('5588999990001','registrar_lead',{nome:'Nome da IA',empresa:'Empresa IA'});
  let lead=await store.getLead('5588999990001');assert.equal(lead.nome,'Maria Souza');assert.equal(lead.empresa,'Empresa IA');
  // Contato que a equipe nunca nomeou continua recebendo o nome informado pelo cliente.
  await store.updateLead('5511955554444',{nomeWhatsApp:'wa'});await agent.runTool('5511955554444','registrar_lead',{nome:'Cliente Real'});assert.equal((await store.getLead('5511955554444')).nome,'Cliente Real');
 }finally{await root.close();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();}
});
