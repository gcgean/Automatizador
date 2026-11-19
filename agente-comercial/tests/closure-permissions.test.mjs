import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';import {requiredPermission,can,ALL_PERMISSIONS,LEGACY_PERMISSIONS} from '../shared/access.js';

test('permissões de finalização: rotas, catálogo e perfil operador',()=>{
 assert.equal(requiredPermission('/leads/5588999990001/conversation-state','POST'),'conversations.close');
 assert.ok(ALL_PERMISSIONS.includes('conversations.close'));assert.ok(ALL_PERMISSIONS.includes('closure-reasons.create'));
 assert.ok(LEGACY_PERMISSIONS.operator.includes('conversations.close'));assert.ok(!LEGACY_PERMISSIONS.viewer.includes('conversations.close'));
 assert.equal(can({role:'operator'},'closure-reasons.create'),true);
 assert.equal(can({role:'operator',permissions:['leads.manage']},'conversations.close'),false);
 assert.equal(can({role:'operator',permissions:['conversations.close']},'conversations.close'),true);
});

test('quem já classificava leads recebe as novas permissões uma única vez',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');const db=new Pool({connectionString:url.toString()}),schema='closeperm_'+crypto.randomBytes(8).toString('hex');await db.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);
 let root=new PgStore(url.toString(),'.');
 try{
  await root.init();
  // Simula grupos e usuário criados antes da mudança.
  await root.pool.query("DELETE FROM schema_migrations WHERE version='closure-permissions-v1'");
  const manager=crypto.randomUUID(),viewer=crypto.randomUUID(),user=crypto.randomUUID();
  await root.pool.query("INSERT INTO access_groups(id,name,permissions) VALUES($1,'Vendas','[\"conversations.view\",\"leads.manage\"]'),($2,'Leitura','[\"conversations.view\"]')",[manager,viewer]);
  await root.pool.query("INSERT INTO users(id,email,name,role,extra_permissions) VALUES($1,'perm@qa.test','QA','operator','[\"leads.manage\"]')",[user]);
  await root.close();root=new PgStore(url.toString(),'.');await root.init();
  const perms=async id=>(await root.pool.query('SELECT permissions FROM access_groups WHERE id=$1',[id])).rows[0].permissions;
  assert.deepEqual(await perms(manager),['conversations.view','leads.manage','conversations.close','closure-reasons.create']);
  assert.deepEqual(await perms(viewer),['conversations.view']);
  assert.deepEqual((await root.pool.query('SELECT extra_permissions FROM users WHERE id=$1',[user])).rows[0].extra_permissions,['leads.manage','conversations.close','closure-reasons.create']);
  // O administrador retira a permissão: reiniciar não devolve.
  await root.pool.query("UPDATE access_groups SET permissions='[\"conversations.view\",\"leads.manage\"]' WHERE id=$1",[manager]);
  await root.close();root=new PgStore(url.toString(),'.');await root.init();
  assert.deepEqual(await perms(manager),['conversations.view','leads.manage']);
 }finally{await root.close();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();}
});
