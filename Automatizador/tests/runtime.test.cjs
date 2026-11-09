const {test}=require('node:test');
const assert=require('node:assert/strict');
const http=require('node:http');
const {requestModel}=require('../electron/model-client.cjs');
const {recentHistory,pageSummary,compactTurns,exactNamedTarget}=require('../electron/context.cjs');
test('clique assistido exige nome entre aspas, busca correspondente e resultado exato único',()=>{
  const result={query:'Marina',elements:[{id:3,label:'Marina',tag:'span'},{id:4,label:'Marina Alves',tag:'div'}]};
  assert.equal(exactNamedTarget('Clique em "Marina".',result).id,3);
  assert.equal(exactNamedTarget('Clique em alguém.',result),null);
  assert.equal(exactNamedTarget('Clique em "Ana".',result),null);
  assert.equal(exactNamedTarget('Clique em "Marina".',{...result,elements:[...result.elements,{id:5,label:'Marina'}]}),null);
});
const {runDeepSeek}=require('../electron/agent.cjs');
async function serverFor(handler){const server=http.createServer(handler);await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));return {server,endpoint:`http://127.0.0.1:${server.address().port}/v1/chat/completions`};}
async function close(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
test('histórico local é limitado sem cortar as instruções selecionadas',()=>{
  const first={role:'user',content:'Nunca invente valores.'};
  const history=[first,...Array.from({length:20},(_,i)=>({role:i%2?'assistant':'user',content:`Mensagem ${i}: `+'texto '.repeat(100)}))];
  const result=recentHistory(history,1800);
  assert.equal(result.reduced,true);assert.deepEqual(result.messages[0],first);assert.ok(result.messages.reduce((sum,m)=>sum+m.content.length,0)<=1800);
  assert.equal(result.messages.at(-1).content,history.at(-1).content);
  assert.deepEqual(recentHistory([first],1800).messages,[first]);
});
test('leituras locais limitam texto e elementos, mantendo ids originais',()=>{
  const result=pageSummary({text:'x'.repeat(20000),elements:Array.from({length:180},(_,id)=>({id,tag:'button',label:`Item ${id}`}))},true);
  assert.equal(result.text.length,1800);assert.equal(result.elements.length,24);assert.equal(result.elements[23].id,23);assert.equal(result.truncated,true);
  const messages=Array.from({length:6},(_,i)=>({role:'tool',content:String(i).repeat(1000)}));
  assert.ok(compactTurns(messages)[0].content.length<400);assert.equal(compactTurns(messages).at(-1).content.length,1000);
});
test('stream nativo transmite texto parcial e ferramentas somente após resposta completa',async()=>{
  let payload;const partial=[];
  const {server,endpoint}=await serverFor(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;payload=JSON.parse(body);
    assert.equal(req.url,'/api/chat');assert.equal(req.headers.authorization,undefined);
    res.writeHead(200,{'Content-Type':'application/x-ndjson'});
    const bytes=Buffer.from(JSON.stringify({message:{content:'Olá, ação verificada.'},done:false})+'\n');
    const split=bytes.indexOf(Buffer.from('á'))+1;
    res.write(bytes.subarray(0,split));setTimeout(()=>res.write(bytes.subarray(split)),10);
    setTimeout(()=>res.end(JSON.stringify({message:{content:'',tool_calls:[{function:{name:'click',arguments:{id:2}}}]},done:true,eval_count:5})+'\n'),30);
  });
  try{
    const result=await requestModel({key:'must-not-leak',model:'test',messages:[{role:'user',content:'Olá'}],tools:[],provider:'ollama',label:'Ollama',endpoint,signal:new AbortController().signal,onText:text=>partial.push(text)});
    assert.deepEqual(partial,['Olá, ação verificada.']);assert.equal(result.message.content,'Olá, ação verificada.');
    assert.equal(JSON.parse(result.message.tool_calls[0].function.arguments).id,2);assert.equal(result.metrics.eval_count,5);assert.equal(payload.keep_alive,'10m');
  }finally{await close(server);}
});
test('stream interrompido não libera uma chamada de ferramenta incompleta',async()=>{
  const {server,endpoint}=await serverFor((_req,res)=>{res.writeHead(200,{'Content-Type':'application/x-ndjson'});res.end(JSON.stringify({message:{tool_calls:[{function:{name:'click',arguments:{id:0}}}]},done:false})+'\n');});
  try{await assert.rejects(requestModel({key:'',model:'test',messages:[],tools:[],provider:'ollama',label:'Ollama',endpoint,signal:new AbortController().signal}),/antes de concluir/);}finally{await close(server);}
});
test('Parar cancela também a leitura do corpo da resposta em streaming',async()=>{
  const controller=new AbortController();
  const {server,endpoint}=await serverFor((_req,res)=>{res.writeHead(200,{'Content-Type':'application/x-ndjson'});res.write(JSON.stringify({message:{content:'Parcial'},done:false})+'\n');});
  try{await assert.rejects(requestModel({key:'',model:'test',messages:[],tools:[],provider:'ollama',label:'Ollama',endpoint,signal:controller.signal,onText:()=>controller.abort()}),{name:'AbortError'});}finally{await close(server);}
});
test('leituras sem avanço são limitadas mesmo com texto e relógio mudando na página',async()=>{
  let requests=0,reads=0;const events=[];
  const {server,endpoint}=await serverFor(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;const request=JSON.parse(body);requests++;
    const canRead=request.format.oneOf.some(b=>b.properties.action.const==='read_page');
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:{content:JSON.stringify(canRead?{action:'read_page',arguments:{}}:{action:'done',message:'Tarefa incompleta: consultas sem avanço.'})},done:true}));
  });
  try{
    await runDeepSeek({key:'',model:'test',task:'Leia a página',history:[],provider:'ollama',label:'Ollama',endpoint,signal:new AbortController().signal,emit:(type,text)=>events.push({type,text}),execute:async name=>{assert.equal(name,'read_page');reads++;return {text:`Relógio dinâmico ${reads}`,elements:[]};}});
    assert.equal(requests,4);assert.equal(reads,4);assert.ok(events.some(e=>e.type==='message' && /sem avanço/.test(e.text)));
  }finally{await close(server);}
});
test('busca repetida com resultados dinâmicos cede a decisão ao clique atual ou encerramento',async t=>{
  for(const found of [true,false])await t.test(found?'encontrado':'não encontrado',async()=>{
    let requests=0,searches=0,clicks=0;const events=[];
    const {server,endpoint}=await serverFor(async(req,res)=>{
      let body='';for await(const chunk of req)body+=chunk;const request=JSON.parse(body);requests++;
      const actions=request.format.oneOf.map(b=>b.properties.action.const);
      const decision=requests<=2?{action:'find_elements',arguments:{text:requests===1?'Contato fictício':'  CONTATO FICTÍCIO  '}}:requests===3 && found?{action:'click',arguments:{id:3}}:{action:'done',message:found?'Conversa fictícia aberta.':'Contato não encontrado; nenhum envio realizado.'};
      if(requests===3){assert.ok(!actions.includes('find_elements'));assert.ok(!actions.includes('read_page'));assert.ok(!actions.includes('wait'));}
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:{content:JSON.stringify(decision)},done:true}));
    });
    try{
      await runDeepSeek({key:'',model:'test',task:'Continue a tarefa no contato fictício.',provider:'ollama',label:'Ollama',endpoint,signal:new AbortController().signal,emit:(type,text)=>events.push({type,text}),execute:async(name,args)=>{
        if(name==='click'){assert.equal(args.id,3);clicks++;return 'Clique executado.';}
        if(name==='find_elements')searches++;
        return {title:'Caixa fictícia',url:'https://example.test/inbox',text:`Relógio ${requests}; notificações ${searches}`,query:name==='find_elements'?args.text:undefined,matchedCount:found?1:0,elements:found?[{id:1+searches,tag:'button',label:'Contato fictício'}]:[]};
      }});
      assert.equal(searches,2);assert.equal(clicks,found?1:0);assert.equal(requests,found?4:3);
      assert.ok(events.some(e=>e.type==='warning' && /sem avanço/.test(e.text)));
    }finally{await close(server);}
  });
});
test('limite de geração interrompe chamadas de ferramenta mesmo com transmissão concluída',async()=>{
  const calls=[];
  const {server,endpoint}=await serverFor((_req,res)=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:{content:'',tool_calls:[{function:{name:'click',arguments:{id:0}}}]},done:true,done_reason:'length'}));});
  try{
    await assert.rejects(runDeepSeek({key:'',model:'test',task:'Abra a aba',provider:'ollama',label:'Ollama',endpoint,signal:new AbortController().signal,emit:()=>{},execute:async name=>{calls.push(name);return {text:'Página',elements:[]};}}),/decisão estruturada ficou incompleta/);
    assert.deepEqual(calls,['read_page']);
  }finally{await close(server);}
});
test('DeepSeek recupera promessa sem ação com decisão validada e um único envio',async()=>{
 let requests=0,sends=0;
 const {server,endpoint}=await serverFor(async(req,res)=>{
  let body='';for await(const chunk of req)body+=chunk;
  const payload=JSON.parse(body);requests++;
  if(requests===2){assert.equal(payload.tools,undefined);assert.match(payload.messages.at(-1).content,/MODO DE DECISÃO/);}
  const content=requests===1?'Vou responder à conversa.':JSON.stringify({action:'send_message',arguments:{fieldId:1,buttonId:2,text:'Olá!'}});
  res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:{role:'assistant',content},finish_reason:'stop'}]}));
 });
 try{
  await runDeepSeek({provider:'deepseek',label:'DeepSeek',key:'test',model:'test',endpoint,task:'Responda a conversa.',signal:new AbortController().signal,emit:()=>{},execute:async(name)=>{
   if(name==='send_message'){sends++;return {sent:true};}
   assert.equal(name,'read_page');return {url:'https://example.test/threads/a',text:'Olá',chatView:{kind:'conversation'},elements:[{id:1,tag:'textarea'},{id:2,tag:'button'}]};
  }});
  assert.equal(requests,2);assert.equal(sends,1);
 }finally{await close(server);}
});
