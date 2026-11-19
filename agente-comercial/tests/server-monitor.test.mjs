import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {cpuPercent,ServerMonitor} from '../server/server-monitor.js';
import {telemetry,measuredPool,sqlLabel,routeLabel,accumulate,percentile} from '../server/telemetry.js';
import {createApp} from '../server/index.js';
import crypto from 'node:crypto';import {Pool} from 'pg';import {PgStore} from '../server/pg-store.js';
test('monitor: coleta persistente e consultas em transação no PostgreSQL',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');const admin=new Pool({connectionString:url.toString()}),schema='monitor_'+crypto.randomBytes(8).toString('hex');await admin.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const root=new PgStore(url.toString(),'.'),monitor=new ServerMonitor(root,'.');
 try{await root.init();await monitor.init();await root.scope('default').transaction(tx=>tx.pool.query('SELECT 42 AS answer'));await monitor.sample();const result=await monitor.report(1,'default');assert.ok(result.current.memory.total>0);assert.ok(result.current.disk.total>0);assert.ok(result.queries.some(r=>r.label.includes('answer')&&r.count===1));assert.ok(result.history.length>0);assert.equal(result.connections[0].id,'default');}finally{await monitor.close();await root.close();await admin.query('DROP SCHEMA '+schema+' CASCADE');await admin.end();}
});
test('monitor: contadores de CPU e remoção de valores sensíveis',()=>{
 assert.equal(cpuPercent({idle:40,total:100},{idle:100,total:200}),40);assert.equal(cpuPercent({idle:0,total:0},{idle:0,total:0}),null);
 const label=sqlLabel("SELECT * FROM leads WHERE phone='5511999999999' AND data=$$secret$$ AND id=123 /* token */ -- password\n");assert.ok(!label.includes('5511'));assert.ok(!label.includes('secret'));assert.ok(!label.includes('token'));assert.ok(!label.includes('password'));assert.ok(!label.includes('123'));
 assert.equal(routeLabel('GET','/leads/5511999999999/tickets'),'GET /leads/:id/tickets');
});
test('monitor: mede consultas uma vez, preserva resultado/erro e separa conexão',async()=>{
 telemetry.enabled=true;telemetry.queries=new Map();const pool={async query(sql){if(sql==='fail')throw new Error('expected');return {rows:[{ok:true}]};}},wrapped=measuredPool(pool,'a'),scoped=measuredPool(wrapped,'b');
 try{assert.equal((await scoped.query('SELECT 1')).rows[0].ok,true);assert.equal([...telemetry.queries.values()][0].count,1);assert.equal(JSON.parse([...telemetry.queries.keys()][0])[0],'b');await assert.rejects(scoped.query('fail'),/expected/);assert.equal([...telemetry.queries.values()].reduce((n,r)=>n+r.errors,0),1);await scoped.query('SELECT * FROM server_monitor_samples');assert.equal(telemetry.queries.size,2);}finally{telemetry.enabled=false;telemetry.queries=new Map();}
});
test('monitor: período e conexão agregam corretamente sem dividir CPU compartilhada',async()=>{
 const map=new Map();accumulate(map,JSON.stringify(['a','GET /leads']),20);accumulate(map,JSON.stringify(['b','GET /leads']),500,true);const sample={at:new Date(),data:{cpu:30,memory:{used:5,total:10},disk:{used:20,total:100},requests:[...map],queries:[]}};
 const monitor=new ServerMonitor({pool:{query:async sql=>({rows:sql.includes('server_monitor_samples')?[sample]:[]})}},'.');
 const a=await monitor.report(1,'a'),all=await monitor.report(1);assert.equal(a.routes[0].count,1);assert.equal(a.routes[0].mean,20);assert.equal(all.routes[0].mean,260);assert.equal(a.history[0].cpu,30);assert.equal(a.history[0].p95,25);assert.equal(percentile([...map.values()][1]),500);
});
test('monitor: acesso global exige administrador da plataforma',async()=>{
 const store={monitor:{report:async()=>({ok:true})}},auth={handle:async()=>false,user:async req=>req.headers.authorization==='platform'?{role:'admin',platform_admin:true}:req.headers.authorization==='admin'?{role:'admin'}:null,sameOrigin:()=>true};
 const server=http.createServer(createApp({config:{},store,auth}));await new Promise(r=>server.listen(0,'127.0.0.1',r));try{const base='http://127.0.0.1:'+server.address().port;assert.equal((await fetch(base+'/server-monitor')).status,403);assert.equal((await fetch(base+'/server-monitor',{headers:{authorization:'admin'}})).status,403);assert.equal((await fetch(base+'/server-monitor',{headers:{authorization:'platform'}})).status,200);}finally{await new Promise(r=>server.close(r));}
});
