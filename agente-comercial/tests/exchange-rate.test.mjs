import test from 'node:test';import assert from 'node:assert/strict';
import {DollarRate,convertedCost} from '../server/exchange-rate.js';
import {MetaCosts} from '../server/meta-costs.js';
test('conversão não troca moeda nem transforma ausência em zero',()=>{
 const fx={available:true,brlPerUsd:5};
 assert.deepEqual([convertedCost({currency:'USD',messageCost:2,callCost:1,status:'ok'},fx).usd,convertedCost({currency:'USD',messageCost:2,callCost:1,status:'ok'},fx).brl],[3,15]);
 assert.equal(convertedCost({currency:'BRL',messageCost:10,callCost:0,status:'ok'},fx).usd,2);
 assert.equal(convertedCost({currency:'USD',messageCost:10,callCost:null,status:'partial'},fx).partial,true);
 assert.equal(convertedCost({currency:'USD',messageCost:null,callCost:null},fx).usd,null);
 assert.equal(convertedCost({currency:'USD',messageCost:2,callCost:0,status:'ok'},{available:false}).brl,null);
 assert.equal(convertedCost({currency:'EUR',messageCost:2,callCost:0,status:'ok'},fx).usd,null);
});
test('cotação pública compartilha chamadas e não envia credenciais',async()=>{
 let calls=0;const fx=new DollarRate({fetchImpl:async(url,options)=>{calls++;assert.equal(new URL(url).hostname,'olinda.bcb.gov.br');assert.ok(String(url).includes('dataHoraCotacao%20desc'));assert.equal(options.headers,undefined);return {ok:true,json:async()=>({value:[{cotacaoVenda:5,dataHoraCotacao:'2026-11-18 13:00:00'}]})};}});
 const [a,b]=await Promise.all([fx.get(),fx.get()]);assert.deepEqual(a,b);assert.equal(a.brlPerUsd,5);await fx.get();assert.equal(calls,1);
 const failure=new DollarRate({fetchImpl:async()=>{throw Error('unavailable');}});assert.equal((await failure.get()).available,false);
});
test('mês usa Brasília e mantém restrições de empresa e conexões',async()=>{
 const api=new MetaCosts({}, {now:()=>Date.parse('2026-12-01T01:00:00Z')});let passed;
 api.report=async args=>{passed=args;return {...args,rows:[],fetchedAt:'test'};};
 await api.monthly({companyId:'tenant',allowedConnections:['one'],connections:['one']},{rateProvider:{get:async()=>({available:false})}});
 assert.equal(passed.from,'2026-11-01');assert.equal(passed.to,'2026-11-30');assert.equal(passed.companyId,'tenant');assert.deepEqual(passed.allowedConnections,['one']);
});
