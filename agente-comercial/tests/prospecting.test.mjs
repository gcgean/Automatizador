import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';
import {Prospecting,normalizePhone,parseCsv,mapColumns,rowToProspect,apiToProspect} from '../server/prospecting.js';

const CASA=`"CNPJ";"Razão Social";"Nome Fantasia";"Situação Cadastral";"Porte";"CNAE Principal Código";"CNAE Principal Descrição";"Bairro";"Município";"UF";"Telefone 1";"Telefone 2";"E-mail";"Capital Social"
"12.345.678/0001-90";"MERCADINHO BOA VISTA LTDA";"Boa Vista";"ATIVA";"MICRO EMPRESA";"4712100";"Comércio varejista de mercadorias em geral";"Centro";"FORTALEZA";"CE";"(85) 3222-1111";"(85) 99876-5432";"contato@boavista.com";"50000"
"98.765.432/0001-10";"OFICINA DO ZE ME";"";"ATIVA";"MEI";"4520001";"Serviços de manutenção e reparação mecânica de veículos";"Aldeota";"FORTALEZA";"CE";"85 98888-7777";"";"";"5000"
"11.111.111/0001-11";"PADARIA SAO JOAO LTDA";"Pão Quente";"ATIVA";"EMPRESA DE PEQUENO PORTE";"1091102";"Fabricação de produtos de panificação";"Centro";"JUAZEIRO DO NORTE";"CE";"(88) 3511-2222";"";"";"80000"
"22.222.222/0001-22";"LOJA REPETIDA";"";"ATIVA";"MICRO EMPRESA";"4781400";"Comércio varejista de artigos do vestuário";"Centro";"SOBRAL";"CE";"(85) 99876-5432";"";"";"10000"`;

test('telefone: só celular brasileiro, fixo fica de fora',()=>{
 assert.deepEqual(normalizePhone('(85) 99876-5432'),{phone:'5585998765432'});
 assert.deepEqual(normalizePhone('+55 85 99876-5432'),{phone:'5585998765432'});
 assert.deepEqual(normalizePhone('85 8876-5432'),{phone:'5585988765432'},'celular antigo sem o 9');
 assert.deepEqual(normalizePhone('(85) 3222-1111'),{reason:'fixo'});
 assert.deepEqual(normalizePhone('123'),{reason:'invalido'});
});
test('planilha da Casa dos Dados: separador ;, aspas e colunas reconhecidas',()=>{
 const rows=parseCsv('﻿'+CASA);assert.equal(rows.length,5);const map=mapColumns(rows[0]);
 assert.deepEqual(map.phones,[10,11]);assert.equal(rows[0][map.city],'Município');assert.equal(rows[0][map.segment],'CNAE Principal Descrição');assert.equal(rows[0][map.cnae],'CNAE Principal Código');assert.equal(rows[0][map.size],'Porte');
 const p=rowToProspect(rows[1],map);assert.equal(p.cnpj,'12345678000190');assert.equal(p.uf,'CE');assert.deepEqual(p.phones,['(85) 3222-1111','(85) 99876-5432']);
 assert.equal(parseCsv('a,b\n"x, y",2')[1][0],'x, y');
 const api=apiToProspect({telefone:'85999990000',razao_social:'ACME',cidade:'Fortaleza',uf:'ce',segmento:'Varejo',perfil:{cargo:'Dono'}});assert.equal(api.uf,'CE');assert.deepEqual(api.profile,{cargo:'Dono'});
});

test('prospecção: chave de API, importação, lotes com aprovação e permissões',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');const db=new Pool({connectionString:url.toString()}),schema='pr_'+crypto.randomBytes(8).toString('hex');await db.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const store=new PgStore(url.toString(),'.');
 try{
  await store.init();const service=new Prospecting(store,{});await service.init();
  const admin={id:crypto.randomUUID(),role:'admin',company_id:'default',connections:['default']};
  const seller={id:crypto.randomUUID(),role:'operator',company_id:'default',connections:['default'],permissions:['prospecting.view','prospecting.manage']};
  for(const u of [admin,seller])await store.pool.query("INSERT INTO users(id,email,name,role,company_id) VALUES($1,$2,'QA',$3,'default')",[u.id,u.id+'@qa.test',u.role]);
  // Contato que já conversa com a empresa e um que pediu para sair.
  await store.scope('default').updateLead('5585988887777',{nome:'Cliente atual'});await store.scope('default').updateLead('5585911112222',{nome:'Saiu',optedOut:true});
  const imp=await service.importCsv(seller,{csv:CASA,fileName:'casa.csv'});
  assert.equal(imp.received,4);assert.equal(imp.created,2);assert.equal(imp.skipped.so_fixo,1);assert.equal(imp.skipped.duplicado_no_arquivo,1);assert.equal(imp.skipped.ja_e_contato,1);
  let sum=await service.summary(seller,{});assert.equal(sum.status.new,1);assert.equal(sum.status.existing,1);assert.equal(sum.facets.city[0].value,'Fortaleza');
  // API por chave.
  await assert.rejects(service.createKey(seller,{name:'Casa'}),/administradores/);
  const key=await service.createKey(admin,{name:'Casa dos Dados',scopes:['prospects:write']});assert.match(key.key,/^ck_[a-f0-9]{8}_/);
  assert.ok(!(JSON.stringify(await service.listKeys(admin))).includes(key.key),'chave completa não volta na listagem');
  const call=async(method,path,body,auth='Bearer '+key.key)=>{let out;const res={};const send=(r,status,b)=>{out={status,body:b};};await service.handleApi({method,headers:{authorization:auth}},res,new URL('http://x'+path),async()=>Buffer.from(JSON.stringify(body||{})),send);return out;};
  assert.equal((await call('GET','/api/v1/ping')).status,200);
  assert.equal((await call('GET','/api/v1/ping',null,'Bearer ck_00000000_naoexiste123456789012345')).status,401);
  const posted=await call('POST','/api/v1/prospects',{prospects:[{telefone:'(11) 97777-6666',razao_social:'Loja SP',cidade:'São Paulo',uf:'SP',segmento:'Varejo',porte:'ME',perfil:{cargo:'Sócio'}},{telefone:'(11) 3333-4444'},{telefone:'5585911112222'}]});
  assert.equal(posted.status,200);assert.equal(posted.body.created,2);assert.equal(posted.body.skipped.so_fixo,1);assert.equal(posted.body.skipped.descadastrado,1);
  assert.equal((await call('GET','/api/v1/prospects')).status,403,'chave só de escrita não consulta');
  await service.revokeKey(admin,key.id);assert.equal((await call('GET','/api/v1/ping')).status,401);
  // Campanha e lote.
  await store.pool.query("UPDATE whatsapp_connections SET enabled=true WHERE id='default'");
  const {campaigns}=await service.saveCampaign(seller,{name:'Varejo CE',connectionId:'default',templateName:'prospeccao_varejo_v1',dailyLimit:30});const camp=campaigns[0];
  await assert.rejects(service.createBatch(seller,{campaignId:camp.id,size:10,filter:{uf:'RS'}}),/Nenhum contato/);
  const batch=await service.createBatch(seller,{campaignId:camp.id,size:10,filter:{}});assert.equal(batch.size,2);
  assert.equal((await service.summary(seller,{})).status.reserved,2);
  const items=await service.batchItems(seller,batch.id);const left=await service.removeFromBatch(seller,batch.id,items[0].id);assert.equal(left.length,1);
  await assert.rejects(service.decideBatch(seller,batch.id,'approve'),/não permite/,'sem permissão de aprovar');
  await service.decideBatch(admin,batch.id,'approve');assert.equal((await service.summary(admin,{})).status.approved,1);
  await assert.rejects(service.decideBatch(admin,batch.id,'reject'),/aguardando/);
  const b2=await service.createBatch(seller,{campaignId:camp.id,size:5,filter:{}});await service.decideBatch(admin,b2.id,'reject','Fora do perfil');assert.equal((await service.summary(admin,{})).status.new,1);
  await assert.rejects(service.summary({...seller,permissions:[]},{}),/não permite/);
 }finally{await store.pool.end();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();}
});

test('Casa dos Dados: filtros viram a pesquisa avançada e a resposta vira prospect',async()=>{
 const {buildSearch,companyToProspect}=await import('../server/casa-dos-dados.js');
 assert.throws(()=>buildSearch({}),/ao menos um filtro/);
 const b=buildSearch({uf:'ce',cities:'Fortaleza, Juazeiro do Norte',cnae:'4712-1/00, xx',sizes:['01','99'],mei:'exclude',limit:5000,openedDays:'365'});
 assert.deepEqual(b.uf,['ce']);assert.deepEqual(b.municipio,['fortaleza','juazeiro do norte']);assert.deepEqual(b.codigo_atividade_principal,['4712100']);
 assert.deepEqual(b.porte_empresa,{codigos:['01']});assert.deepEqual(b.mei,{excluir_optante:true});assert.equal(b.limite,1000);assert.equal(b.mais_filtros.somente_celular,true);assert.equal(b.mais_filtros.excluir_empresas_visualizadas,true);assert.deepEqual(b.data_abertura,{ultimos_dias:365});
 const p=companyToProspect({cnpj:'12345678000190',razao_social:'MERCADINHO X LTDA',nome_fantasia:'X',porte_empresa:{codigo:'01',descricao:'MICRO EMPRESA'},atividade_principal:{codigo:'4712100',descricao:'Comércio varejista'},endereco:{municipio:'FORTALEZA',uf:'CE',bairro:'Centro'},contato_telefonico:[{completo:'(85) 99876-5432',tipo:'celular'},{ddd:'85',numero:'32221111'}],contato_email:[{email:'a@x.com'}],quadro_societario:[{nome:'FULANO'}]});
 assert.deepEqual(p.phones,['(85) 99876-5432','8532221111']);assert.equal(p.segment,'Comércio varejista');assert.equal(p.size,'MICRO EMPRESA');assert.equal(p.email,'a@x.com');assert.equal(p.profile.contato,'FULANO');
});

test('Casa dos Dados: chave conferida e protegida, busca importa para a base',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');const db=new Pool({connectionString:url.toString()}),schema='prc_'+crypto.randomBytes(8).toString('hex');await db.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const store=new PgStore(url.toString(),'.');
 const GOOD='cdd_'+crypto.randomBytes(16).toString('hex');const calls=[];
 const fetch=async(u,o)=>{calls.push({u,o});const ok=o.headers['api-key']===GOOD;const json=(status,b)=>({ok:status<300,status,text:async()=>JSON.stringify(b)});
  if(!ok)return json(401,{mensagem:'api key inválida'});
  if(u.endsWith('/v5/saldo'))return json(200,{saldo_total:900,saldos:{bonus:{valor:900,criado_em:'2026-01-01',expira_em:'2027-01-01'}}});
  if(u.includes('/v5/cnpj/pesquisa'))return json(200,{total:3,cnpjs:[
   {cnpj:'1',razao_social:'A LTDA',endereco:{municipio:'FORTALEZA',uf:'CE'},atividade_principal:{codigo:'4712100',descricao:'Varejo'},contato_telefonico:[{completo:'85999990001'}]},
   {cnpj:'2',razao_social:'B LTDA',endereco:{municipio:'FORTALEZA',uf:'CE'},contato_telefonico:[{completo:'8532220000'}]}]});
  return json(404,{});};
 try{
  await store.init();const service=new Prospecting(store,{connectionsKey:'a'.repeat(64)},{fetch});await service.init();
  const admin={id:crypto.randomUUID(),role:'admin',company_id:'default',connections:['default']};
  const seller={id:crypto.randomUUID(),role:'operator',company_id:'default',connections:['default'],permissions:['prospecting.view','prospecting.manage']};
  for(const u of [admin,seller])await store.pool.query("INSERT INTO users(id,email,name,role,company_id) VALUES($1,$2,'QA',$3,'default')",[u.id,u.id+'@qa.test',u.role]);
  assert.deepEqual(await service.cdd.status(seller),{configured:false});
  await assert.rejects(service.cdd.search(seller,{uf:'CE'}),/Conecte a Casa dos Dados/);
  await assert.rejects(service.cdd.saveKey(seller,{apiKey:GOOD}),/administradores/);
  await assert.rejects(service.cdd.saveKey(admin,{apiKey:'cdd_'+'0'.repeat(32)}),/recusou a chave/);
  const st=await service.cdd.saveKey(admin,{apiKey:GOOD});assert.equal(st.configured,true);assert.equal(st.balance,900);assert.equal(st.hint,'••••'+GOOD.slice(-4));
  const raw=JSON.stringify((await store.pool.query('SELECT * FROM casa_dos_dados_settings')).rows);assert.ok(!raw.includes(GOOD),'chave cifrada no banco');assert.ok(!JSON.stringify(st).includes(GOOD));
  const r=await service.cdd.search(seller,{uf:'CE',limit:2});
  assert.equal(r.created,1);assert.equal(r.skipped.so_fixo,1);assert.equal(r.total,3);assert.equal(r.hasMore,true);assert.equal(r.balance,900);
  const sent=calls.find(c=>c.u.includes('/pesquisa'));assert.match(sent.u,/tipo_resultado=completo/);assert.deepEqual(JSON.parse(sent.o.body).uf,['ce']);
  const row=(await store.pool.query('SELECT phone,city,segment,source FROM prospects')).rows[0];assert.deepEqual(row,{phone:'5585999990001',city:'Fortaleza',segment:'Varejo',source:'casa-dos-dados-api'});
  await assert.rejects(service.cdd.search({...seller,permissions:['prospecting.view']},{uf:'CE'}),/não permite/);
  await service.cdd.removeKey(admin);assert.equal((await service.cdd.status(admin)).configured,false);
 }finally{await store.pool.end();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();}
});
