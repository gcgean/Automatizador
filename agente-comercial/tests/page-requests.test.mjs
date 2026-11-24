import test from 'node:test';import assert from 'node:assert/strict';import crypto from 'node:crypto';import {Pool} from 'pg';
import {PgStore} from '../server/pg-store.js';import {encryptSecret} from '../server/secrets.js';
import {PAGE_REQUEST_TOOL,validatePageRequest,telegramPageAlert,requestPage} from '../server/page-requests.js';
const key='c'.repeat(64);
test('página que falta: validação e aviso só para gestores no Telegram',async()=>{
 assert.equal(PAGE_REQUEST_TOOL.name,'sinalizar_pagina_faltante');
 assert.throws(()=>validatePageRequest({necessidade:'curto',sugestao_pagina:'Página X'}),/necessidade/);
 assert.deepEqual(validatePageRequest({necessidade:'  Sistema para   clínica veterinária com agenda ',ramo:'',sugestao_pagina:'Sistema para clínica veterinária'}),{need:'Sistema para clínica veterinária com agenda',segment:null,suggestion:'Sistema para clínica veterinária'});
 const queries=[],pool={query:async(sql,params)=>{queries.push(sql);if(/FROM commercial_telegram WHERE/.test(sql))return {rows:[{token_cipher:encryptSecret('123:abc',key)}]};if(/commercial_telegram_recipients/.test(sql)){assert.match(sql,/r\.manager/);return {rows:[{chat_cipher:encryptSecret('999',key)}]};}return {rows:[]};}};
 const calls=[];const sent=await telegramPageAlert(pool,{connectionsKey:key},{companyId:'default',connectionName:'Comercial Command',need:'Sistema para clínica veterinária',segment:'Veterinária',suggestion:'Sistema para clínica veterinária'},async(url,o)=>{calls.push({url,body:JSON.parse(o.body)});return {ok:true,json:async()=>({ok:true})};});
 assert.equal(sent,1);assert.equal(calls[0].url,'https://api.telegram.org/bot123:abc/sendMessage');assert.equal(calls[0].body.chat_id,'999');assert.match(calls[0].body.text,/Página que falta/);assert.match(calls[0].body.text,/Ramo: Veterinária/);
 const none={query:async()=>({rows:[]})};assert.equal(await telegramPageAlert(none,{connectionsKey:key},{companyId:'default',need:'x',suggestion:'y'},async()=>{throw new Error('não deveria enviar');}),0);
});
test('página que falta: um registro por contato',{skip:!process.env.TEST_DATABASE_URL},async()=>{
 const url=new URL(process.env.TEST_DATABASE_URL);assert.equal(url.hostname,'127.0.0.1');const db=new Pool({connectionString:url.toString()}),schema='pagereq_'+crypto.randomBytes(6).toString('hex');await db.query('CREATE SCHEMA '+schema);url.searchParams.set('options','-c search_path='+schema);const root=new PgStore(url.toString(),'.');
 try{await root.init();const store=root.scope('default'),input={necessidade:'Sistema para clínica veterinária com prontuário',ramo:'Veterinária',sugestao_pagina:'Sistema para clínica veterinária'};
  const first=await requestPage(store,'5511999990001',input,{connectionsKey:key},{fetchImpl:async()=>{throw new Error('sem bot configurado');}});assert.equal(first.created,true);
  assert.deepEqual(await requestPage(store,'5511999990001',input,{connectionsKey:key}),{already:true});
  const rows=(await root.pool.query('SELECT need,segment,suggestion,status FROM page_requests')).rows;assert.equal(rows.length,1);assert.equal(rows[0].status,'new');assert.equal(rows[0].segment,'Veterinária');
 }finally{await root.close();await db.query('DROP SCHEMA '+schema+' CASCADE');await db.end();}
});
