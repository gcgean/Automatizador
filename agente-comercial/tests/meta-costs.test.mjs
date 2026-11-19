import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {MetaCosts,costPeriod} from '../server/meta-costs.js';
import {createApp} from '../server/index.js';

const now=Date.parse('2026-11-11T20:00:00Z'),start=Date.parse('2026-11-10T03:00:00Z')/1000;
const connections=[{id:'default',name:'Command',displayPhone:'+55 85 93618-1071'},{id:'cilos',name:'Cilos',displayPhone:'+55 11 95507-5868'}];
const registry={list:async()=>connections,configFor:async id=>({graphVersion:'v23.0',wabaId:id,accessToken:'test-token'})};
test('custos: separa número na mesma WABA, preserva frações, soma por moeda e não duplica consulta',async()=>{
 let requests=0;const fetchImpl=async(url,options)=>{requests++;assert.equal(options.headers.Authorization,'Bearer test-token');assert.equal(url.searchParams.has('access_token'),false);const field=url.searchParams.get('fields'),phone=url.pathname.endsWith('/cilos')?'5511955075868':'5585936181071';assert.ok(field==='currency'||field.includes('phone_numbers(["'+phone+'"])'));const data=field==='currency'?{currency:phone.startsWith('5511')?'BRL':'USD'}:field.startsWith('pricing_analytics')?{pricing_analytics:{data:[{data_points:[{start,phone_number:phone,cost:0.01,volume:2,pricing_category:"UTILITY"},{start,phone_number:'558897337701',cost:500,volume:999}]}]}}:{call_analytics:{data:[{data_points:[{start,phone_number:phone,cost:0.00108,count:1}]}]}};return {ok:true,json:async()=>data};};
 const costs=new MetaCosts(registry,{fetchImpl,now:()=>now});const args={from:'2026-11-10',to:'2026-11-11'},[a,b]=await Promise.all([costs.report(args),costs.report(args)]);assert.deepEqual(a,b);assert.equal(requests,6);assert.equal(a.rows[0].messageCost,0.01);assert.equal(a.rows[0].messages,2);assert.deepEqual(a.rows[0].categories,[{category:"UTILITY",cost:0.01,volume:2}]);assert.equal(a.rows[0].callCost,0.00108);assert.equal(a.totals.length,2);assert.equal(a.totals[0].total,0.01108);assert.ok(!JSON.stringify(a).includes('558897337701'));await costs.report(args);assert.equal(requests,6);
});
test('custos: falha e custo ausente não viram total zero ou faturamento completo',async()=>{
 const api=new MetaCosts(registry,{now:()=>now,fetchImpl:async url=>{const field=url.searchParams.get('fields');if(field==='currency')return {ok:true,json:async()=>({currency:'USD'})};if(field.startsWith('call_analytics'))throw Error('network');return {ok:true,json:async()=>({pricing_analytics:{data:[{data_points:[{start,phone_number:'5585936181071',volume:2}]}]}})};}});
 const report=await api.report({from:'2026-11-10',to:'2026-11-11',connections:['default']});assert.equal(report.complete,false);assert.equal(report.rows[0].status,'unavailable');assert.equal(report.rows[0].callCost,null);assert.equal(report.rows[0].messageCost,null);assert.deepEqual(report.totals,[]);
 await assert.rejects(api.report({from:'2026-11-10',to:'2026-11-11',connections:['unknown']}),e=>e.status===404);
 for(const [from,to] of [['2026-02-30','2026-03-01'],['2020-01-01','2020-01-02'],['2026-11-12','2026-11-13'],['2026-11-11','2026-11-10']])assert.throws(()=>costPeriod(from,to,now),e=>e.status===400);
});
test('custos HTTP: exige autenticação e administrador antes de acessar a Meta',async()=>{
 let external=0;const registry={list:async()=>{external++;return [];}};const auth={handle:async()=>false,user:async req=>req.headers['x-user']?{id:'qa',role:req.headers['x-user']}:null,sameOrigin:()=>true};
 const server=http.createServer(createApp({config:{publicUrl:'https://qa.test'},store:{},registry,auth}));await new Promise(r=>server.listen(0,'127.0.0.1',r));try{const url='http://127.0.0.1:'+server.address().port+'/meta-costs?from=2026-11-10&to=2026-11-11';assert.equal((await fetch(url)).status,401);assert.equal((await fetch(url,{headers:{'x-user':'operator'}})).status,403);assert.equal((await fetch(url,{headers:{'x-user':'viewer'}})).status,403);assert.equal(external,0);}finally{await new Promise(r=>server.close(r));}
});

test('detalhamento converte custos sem consultar Instagram e mantém isolamento',async()=>{
 const reg={list:async()=>[{id:'ig',channel:'instagram',companyId:'a'},{id:'other',companyId:'b'}],configFor:async()=>{throw Error('não deveria consultar credenciais');}};
 const api=new MetaCosts(reg,{now:()=>now});
 const r=await api.detailed({from:'2026-11-10',to:'2026-11-11',companyId:'a'},{rateProvider:{get:async()=>({available:true,brlPerUsd:5})}});
 assert.equal(r.rows.length,1);assert.equal(r.rows[0].status,'not_applicable');assert.equal(r.rows[0].usd,null);
 await assert.rejects(api.detailed({from:'2026-11-10',to:'2026-11-11',companyId:'a',connections:['other']},{rateProvider:{get:async()=>({available:false})}}),e=>e.status===404);
});
