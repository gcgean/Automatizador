import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';import {attendanceDashboard,dashboardFilters} from '../server/attendance-dashboard.js';
test('dashboard de atendimentos: só chamados com conversa, TMA, 1ª resposta, atendentes e filtros',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');assert.equal(url.port,'5548');const db=new Pool({connectionString:url.toString()}),schema='attdash_'+crypto.randomBytes(8).toString('hex');await db.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const root=new PgStore(url.toString(),'.');
 try{
  await root.init();const pool=root.pool,ana=crypto.randomUUID(),dept=crypto.randomUUID();
  await pool.query("INSERT INTO users(id,email,name,role) VALUES($1,'ana@qa.test','Ana','operator')",[ana]);
  await pool.query("INSERT INTO departments(id,company_id,name) VALUES($1,'default','Vendas')",[dept]);
  await pool.query('ALTER TABLE leads DISABLE TRIGGER service_ticket_sync');
  const at=s=>new Date(s).toISOString();let n=0;
  async function ticket({opened,closed=null,user=null,department=null,msgs=[]}){const phone='55119990'+String(++n).padStart(5,'0');await pool.query("INSERT INTO leads(connection_id,phone,data) VALUES('default',$1,$2)",[phone,JSON.stringify({temperatura:n%2?'quente':'frio'})]);const {rows:[t]}=await pool.query("INSERT INTO service_tickets(connection_id,phone,opened_at,closed_at,assigned_user_id,department_id) VALUES('default',$1,$2,$3,$4,$5) RETURNING id",[phone,at(opened),closed&&at(closed),user,department]);for(const [i,[direction,actor,when]] of msgs.entries())await pool.query("INSERT INTO messages(id,connection_id,phone,direction,occurred_at,data,ticket_id) VALUES($1,'default',$2,$3,$4,$5,$6)",[phone+'-'+i,phone,direction,at(when),JSON.stringify({actor}),t.id]);return t.id;}
  // Período: 10 a 11/11 (Brasília). IA resolve sozinha em 30 min, 1ª resposta 2 min.
  await ticket({opened:'2026-11-10T12:00:00Z',closed:'2026-11-10T12:30:00Z',msgs:[['in','client','2026-11-10T12:00:00Z'],['out','ai','2026-11-10T12:02:00Z']]});
  // Humano: aberto 11/11, finalizado em 90 min, 1ª resposta 10 min (mensagem de sistema não conta).
  await ticket({opened:'2026-11-11T13:00:00Z',closed:'2026-11-11T14:30:00Z',user:ana,department:dept,msgs:[['in','client','2026-11-11T13:00:00Z'],['out','system','2026-11-11T13:01:00Z'],['out','human','2026-11-11T13:10:00Z']]});
  // Em aberto, sem resposta ainda.
  await ticket({opened:'2026-11-11T20:00:00Z',user:ana,msgs:[['in','client','2026-11-11T20:00:00Z']]});
  // Sem mensagem do cliente (contato importado): fica de fora.
  await ticket({opened:'2026-11-11T15:00:00Z',msgs:[['out','system','2026-11-11T15:00:00Z']]});await ticket({opened:'2026-11-11T15:00:00Z'});
  // Período anterior (08 a 09/11): 1 atendimento.
  await ticket({opened:'2026-11-08T12:00:00Z',closed:'2026-11-08T13:00:00Z',msgs:[['in','client','2026-11-08T12:00:00Z'],['out','ai','2026-11-08T12:05:00Z']]});
  const from='2026-11-10T03:00:00.000Z',to='2026-11-12T03:00:00.000Z',connections=[{id:'default',name:'Comercial',color:'#2563eb'}];
  const d=await attendanceDashboard(pool,{companyId:'default',connections,from,to});
  assert.deepEqual({total:d.summary.total,closed:d.summary.closed,open:d.summary.open,tma:d.summary.tma,first:d.summary.firstResponse,att:d.summary.attendants,ai:d.summary.aiOnly},{total:3,closed:2,open:1,tma:60,first:6,att:1,ai:50});
  assert.equal(d.period.days,2);assert.equal(d.summary.dailyAverage,1.5);
  assert.deepEqual(d.daily,[{day:'2026-11-10',opened:1,closed:1},{day:'2026-11-11',opened:2,closed:1}]);
  assert.equal(d.previous.total,1);assert.equal(d.variation.total,200);assert.equal(d.variation.tma,0);
  assert.deepEqual(d.byAttendant.map(a=>[a.name,a.total,a.closed,a.share,a.daily]),[['Ana',2,1,67,[0,2]],['HELENA (sem atendente)',1,1,33,[1,0]]]);
  assert.deepEqual(d.byDepartment.map(a=>[a.name,a.total]),[['Sem setor',2],['Vendas',1]]);
  assert.deepEqual(d.byConnection.map(a=>[a.name,a.total]),[['Comercial',3]]);
  assert.equal(d.temperatures.reduce((s,t)=>s+t.total,0),3);
  const byUser=await attendanceDashboard(pool,{companyId:'default',connections,from,to,userId:ana});assert.equal(byUser.summary.total,2);
  const byDept=await attendanceDashboard(pool,{companyId:'default',connections,from,to,departmentId:dept});assert.equal(byDept.summary.total,1);
  assert.equal((await attendanceDashboard(pool,{companyId:'default',connections:[],from,to})).summary.total,0);
  assert.throws(()=>dashboardFilters(new URL('http://x/?user=1;drop')),/inválido/);
  assert.deepEqual(dashboardFilters(new URL('http://x/?connections=a,b')),{departmentId:null,userId:null,connections:['a','b']});
 }finally{await root.close();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();}
});
