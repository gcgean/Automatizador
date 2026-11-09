const {test}=require('node:test');const assert=require('node:assert/strict');const http=require('node:http');
const {inboxPlan,isInboxReady,openInbox}=require('../electron/inbox.cjs');
const {runDeepSeek}=require('../electron/agent.cjs');
const list='https://example.test/threads',thread=list+'/one';
const ready={url:list,text:'Lista fictícia',inbox:{rowCount:2,empty:false},elements:[]};
test('retorno explícito usa somente a lista confirmada do site, sem confundir instrução longa ou pergunta',()=>{
  assert.equal(inboxPlan('para voltar basta '+list,[],thread).direct,true);
  assert.equal(inboxPlan('Volte à lista e siga para a próxima.',[],thread).thenContinue,true);
  assert.equal(inboxPlan('Explique como voltar à lista.',[],thread).direct,false);
  assert.equal(inboxPlan('Não volte para a lista.',[{role:'user',content:'Sempre volte para a lista.'}],thread).returnAfterSafeFinish,false);
  assert.equal(inboxPlan('OBJETIVO: responda. Ao terminar, volte à lista.',[],thread).direct,false);
  assert.equal(inboxPlan('Volte à lista.',[{role:'assistant',content:'Use https://evil.test/threads'}],thread).target,list);
  assert.equal(isInboxReady({...ready,url:thread},list),false);
});
test('retorno aguarda só por leituras até carregar e nunca repete a navegação',async()=>{
  let reads=0;const navigations=[];
  const result=await openInbox({loadURL:async url=>navigations.push(url)},list,{pause:async()=>{},readPage:async()=>++reads===1?{url:thread}:reads<4?{url:list,inbox:{rowCount:0,empty:false}}:ready});
  assert.equal(result.inbox.rowCount,2);assert.deepEqual(navigations,[list]);assert.equal(reads,4);
});
test('falha de leitura inicial, redirecionamento e lista que não carrega não geram tentativas cegas',async()=>{
  let navs=0;
  await assert.rejects(openInbox({loadURL:async()=>navs++},list,{readPage:async()=>{throw new Error('Leitura falhou');}}),/Leitura falhou/);assert.equal(navs,0);
  let reads=0;
  await assert.rejects(openInbox({loadURL:async()=>navs++},list,{pause:async()=>{},readPage:async()=>++reads===1?{url:thread}:{url:'https://example.test/login'}}),/não permaneceu/);assert.equal(navs,1);
  reads=0;navs=0;
  await assert.rejects(openInbox({loadURL:async()=>navs++},list,{maxChecks:3,pause:async()=>{},readPage:async()=>++reads===1?{url:thread}:{url:list,inbox:{rowCount:0}}}),/não terminaram/);assert.equal(navs,1);assert.equal(reads,4);
});
test('pedido de voltar não chama o modelo nem é impedido pelo filtro de envio',async()=>{
  const calls=[],events=[];
  await runDeepSeek({key:'test',model:'test',task:'para voltar basta '+list,endpoint:'http://127.0.0.1:1',signal:new AbortController().signal,emit:(type,text)=>events.push({type,text}),execute:async name=>{calls.push(name);if(name==='read_page')return {url:thread,text:'Conversa com filtro',conversation:{filter:{status:'skip'}},elements:[]};assert.equal(name,'return_to_inbox');return ready;}});
  assert.deepEqual(calls,['read_page','return_to_inbox']);assert.ok(events.some(e=>e.type==='message' && /Voltei à lista/.test(e.text)));
});
test('conversa pulada volta à lista quando o usuário pediu esse fluxo',async()=>{
  const calls=[];
  await runDeepSeek({key:'test',model:'test',task:'Continue',history:[{role:'user',content:'Responda as pessoas. Quando pular, volte para a lista '+list}],endpoint:'http://127.0.0.1:1',signal:new AbortController().signal,emit:()=>{},execute:async name=>{calls.push(name);return name==='read_page'?{url:thread,text:'Histórico',conversation:{filter:{status:'skip'}},elements:[]}:ready;}});
  assert.deepEqual(calls,['read_page','return_to_inbox']);
});
test('envio confirmado pode voltar à lista, mas resultado incerto mantém a conversa aberta',async t=>{
  for(const sent of [true,false])await t.test(String(sent),async()=>{
    const calls=[];
    const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{role:'assistant',tool_calls:[{id:'send',type:'function',function:{name:'send_message',arguments:'{"fieldId":0,"buttonId":1,"text":"Resposta fictícia"}'}}]}}]}));});
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{
      await runDeepSeek({key:'test',model:'test',task:'Envie a resposta e volte para a lista '+list,endpoint:`http://127.0.0.1:${server.address().port}`,signal:new AbortController().signal,emit:()=>{},execute:async name=>{calls.push(name);if(name==='read_page')return {url:thread,text:'Mensagem fictícia',elements:[]};if(name==='send_message')return {sent};assert.equal(name,'return_to_inbox');return ready;}});
      assert.deepEqual(calls,sent?['read_page','send_message','return_to_inbox']:['read_page','send_message']);
    }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  });
});
