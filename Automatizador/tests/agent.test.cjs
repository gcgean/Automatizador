const {test} = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const {runDeepSeek} = require('../electron/agent.cjs');
const {normalizeURL} = require('../electron/browser.cjs');
const {normalizeLocalBase,connection}=require('../electron/providers.cjs');
function mockReply(message,request){
  if(!request.format)return message;
  const call=message.tool_calls?.[0];
  return {content:JSON.stringify(call?{action:call.function.name,arguments:typeof call.function.arguments==='string'?JSON.parse(call.function.arguments):call.function.arguments}:{action:'done',message:message.content})};
}
async function readRequest(req){let body='';for await(const chunk of req)body+=chunk;return JSON.parse(body);}
test('prévia do inbox não fundamenta filtro: abre e lê conversa ou informa contexto ausente',async t=>{
  for(const opens of [true,false])await t.test(opens?'modelo abre conversa':'modelo insiste em descartar',async()=>{
    let requests=0,opened=false;const events=[],calls=[];
    const bad='Mensagem não enviada. Não há usuários no inbox que já tenham nosigilo no histórico.';
    const server=http.createServer(async(req,res)=>{
      const request=await readRequest(req);requests++;
      const message=requests===1 || !opens?{content:bad}:requests===2?{tool_calls:[{function:{name:'click',arguments:{id:1}}}]}:{content:'Histórico individual lido; falta a informação solicitada pela pessoa para compor uma resposta correta.'};
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:mockReply(message,request),done:true}));
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{
      await runDeepSeek({key:'',provider:'ollama',model:'test',task:'Responda de acordo com o contexto. Pular quem já tem "nosigilo" no histórico.',endpoint:`http://127.0.0.1:${server.address().port}`,signal:new AbortController().signal,emit:(type,text)=>events.push({type,text}),execute:async name=>{
        calls.push(name);if(name==='click'){opened=true;return 'Clique executado.';}
        return {text:opened?'Pessoa: Você atende amanhã?':'Inbox: Pessoa — Você atende amanhã?',chatView:{kind:opened?'conversation':'inbox'},elements:[{id:1,tag:'button',label:'Pessoa'}]};
      }});
      assert.equal(requests,opens?3:2);assert.equal(calls.filter(n=>n==='click').length,opens?1:0);
      assert.ok(!events.some(e=>e.type==='message' && e.text===bad));
      if(!opens)assert.ok(events.some(e=>e.type==='message' && /Não determinei quem deve ser pulado/.test(e.text)));
    }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  });
});
test('Ollama mantém decisão estruturada em pedidos sem palavras-chave e em ajustes de tom',async t=>{
  for(const task of ['Personalize a mensagem usando a cidade do perfil.','Use frases mais curtas nas próximas respostas.'])await t.test(task,async()=>{
    const requests=[],calls=[];
    const server=http.createServer(async(req,res)=>{
      const request=await readRequest(req);requests.push(request);
      const message=task.startsWith('Personalize') && requests.length===1?{tool_calls:[{function:{name:'find_elements',arguments:{text:'cidade'}}}]}:{content:'Orientação registrada. Nenhuma mensagem enviada.'};
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:mockReply(message,request),done:true}));
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{
      await runDeepSeek({key:'',provider:'ollama',model:'test',task,endpoint:`http://127.0.0.1:${server.address().port}`,signal:new AbortController().signal,emit:()=>{},execute:async name=>{
        calls.push(name);return {text:'Perfil fictício; cidade não informada.',elements:[{id:0,tag:'button',label:'Perfil'}]};
      }});
      assert.ok(requests.every(r=>r.format && !r.tools));
      assert.deepEqual(calls,task.startsWith('Personalize')?['read_page','find_elements']:['read_page']);
    }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  });
});
test('campo já confirmado não é preenchido de novo e insistência encerra a tarefa',async()=>{
  let writes=0,requests=0,value='';const events=[];
  const server=http.createServer(async(req,res)=>{
    const request=await readRequest(req);requests++;
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:mockReply({tool_calls:[{function:{name:'fill',arguments:{id:1,value:'Fictício'}}}]},request),done:true}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    await runDeepSeek({key:'',provider:'ollama',model:'test',task:'Continue: preencha o campo com Fictício, sem enviar.',endpoint:`http://127.0.0.1:${server.address().port}`,signal:new AbortController().signal,emit:(type,text)=>events.push({type,text}),execute:async(name,args)=>{
      if(name==='read_page')return {text:'Formulário fictício',elements:[{id:1,label:'Mensagem',tag:'input',value}]};
      assert.equal(name,'fill');writes++;value=args.value;return 'Campo preenchido.';
    }});
    assert.equal(writes,1);assert.equal(requests,3);
    assert.ok(events.some(e=>/Interrompi sem repetir/.test(e.text)));
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('sem ação inicial, promessa em tarefa executável passa para decisão estruturada após leitura nova',async()=>{
  const requests=[],calls=[],events=[];
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;const request=JSON.parse(body);requests.push(request);
    const message=requests.length===1?{content:'Agora vou preencher o campo.'}:requests.length===2?{tool_calls:[{function:{name:'fill',arguments:{id:2,value:'Fictício'}}}]}:{content:'Campo preenchido; nenhuma mensagem enviada.'};
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:mockReply(message,request),done:true}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    await runDeepSeek({key:'',provider:'ollama',model:'test',task:'Preencha somente o campo com Fictício. Não envie.',endpoint:`http://127.0.0.1:${server.address().port}`,signal:new AbortController().signal,emit:(type,text)=>events.push({type,text}),execute:async name=>{
      calls.push(name);return name==='read_page'?{text:'Campo fictício',elements:[{id:2,label:'Mensagem',tag:'input'}]}:'Campo preenchido.';
    }});
    assert.deepEqual(calls,['read_page','read_page','fill','read_page']);
    assert.ok(requests[0].format);assert.ok(requests[1].format);assert.equal(requests[1].tools,undefined);
    assert.ok(events.some(e=>e.type==='message' && /nenhuma mensagem enviada/.test(e.text)));
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('continua etapas prometidas somente após nova leitura e avanço real',async()=>{
  const requests=[],calls=[],events=[];
  const tool=(name,args)=>({content:'',tool_calls:[{function:{name,arguments:args}}]});
  const replies=[tool('click',{id:1}),{content:'Vou preencher o campo.'},tool('fill',{id:2,value:'Resposta fictícia'}),{content:'Agora, vou enviar a resposta.'},tool('click',{id:3}),tool('read_page',{}),{content:'Resposta fictícia confirmada na página.'}];
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;requests.push(JSON.parse(body));
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:mockReply(replies[requests.length-1],requests.at(-1)),done:true}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    await runDeepSeek({key:'',provider:'ollama',model:'test',task:'Abra o contato fictício, preencha a resposta fictícia e clique no botão final.',endpoint:`http://127.0.0.1:${server.address().port}`,signal:new AbortController().signal,emit:(type,text)=>events.push({type,text}),execute:async(name,args)=>{
      calls.push({name,args});return name==='read_page'?{text:'Página fictícia',elements:[{id:1,label:'Contato',tag:'button'},{id:2,label:'Mensagem',tag:'textarea'},{id:3,label:'Enviar',tag:'button'}]}:'Ação executada.';
    }});
    assert.deepEqual(calls.map(c=>c.name),['read_page','click','read_page','read_page','fill','read_page','read_page','click','read_page','read_page']);
    assert.ok(requests[2].messages.some(m=>/LEITURA NOVA/.test(m.content)));
    assert.ok(requests[4].messages.some(m=>/1 preenchimento/.test(m.content)));
    assert.ok(requests[2].format);assert.equal(requests[2].tools,undefined);
    assert.ok(events.some(e=>e.type==='action' && /2 clique\(s\), 1 preenchimento/.test(e.text)));
    assert.ok(!events.some(e=>e.type==='message' && e.text==='Vou preencher o campo.'));
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('promessa de confirmar após preencher exige leitura e não comprova envio',async t=>{
  for(const verb of ['confirmar','verificar','conferir','consultar','ler','checar','validar'])await t.test(verb,async()=>{
    let requests=0;const calls=[],events=[];
    const promise=`Agora vou ${verb} a página para verificar se a mensagem foi enviada com sucesso.`;
    const server=http.createServer(async(req,res)=>{
      let body='';for await(const chunk of req)body+=chunk;
      requests++;const message=requests===1?{tool_calls:[{function:{name:'fill',arguments:{id:1,value:'Resposta fictícia'}}}]}:{content:promise};
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:mockReply(message,JSON.parse(body)),done:true}));
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{
      await runDeepSeek({key:'',provider:'ollama',model:'test',task:'Preencha a resposta fictícia e confira a página. Não envie.',endpoint:`http://127.0.0.1:${server.address().port}`,signal:new AbortController().signal,emit:(type,text)=>events.push({type,text}),execute:async name=>{
        calls.push(name);return name==='read_page'?{text:'Resposta fictícia ainda no campo, sem envio.',elements:[{id:1,label:'Mensagem',tag:'input'}]}:'Campo preenchido.';
      }});
      assert.deepEqual(calls,['read_page','fill','read_page','read_page']);
      assert.equal(requests,3);
      assert.ok(!events.some(e=>e.type==='message' && e.text===promise));
      assert.ok(events.some(e=>e.type==='message' && /incompleta.*0 clique\(s\), 1 preenchimento.*não confirmei o envio/s.test(e.text)));
    }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  });
});
test('continuação não repete ações sem avanço, com leitura inválida ou resultado desconhecido',async t=>{
  for(const mode of ['sem avanço','leitura inválida','resultado desconhecido'])await t.test(mode,async()=>{
    let requests=0,reads=0;const calls=[],events=[];
    const server=http.createServer(async(req,res)=>{
      let body='';for await(const chunk of req)body+=chunk;
      requests++;const message=requests===1?{tool_calls:[{function:{name:'click',arguments:{id:1}}}]}:{content:'Vou preencher e enviar.'};
      res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:mockReply(message,JSON.parse(body)),done:true}));
    });
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
    try{
      await runDeepSeek({key:'',provider:'ollama',model:'test',task:'Abra o contato fictício e preencha a resposta.',endpoint:`http://127.0.0.1:${server.address().port}`,signal:new AbortController().signal,emit:(type,text)=>events.push({type,text}),execute:async name=>{
        calls.push(name);
        if(name==='read_page'){
          reads++;if(reads>1 && mode==='leitura inválida')throw new Error('Leitura indisponível.');
          return {text:'Página fictícia',elements:[{id:1,label:'Contato',tag:'button'}]};
        }
        if(mode==='resultado desconhecido')throw Object.assign(new Error('Resultado desconhecido.'),{recoverable:false});
        return 'Ação executada.';
      }});
      assert.equal(calls.filter(name=>name==='click').length,1);
      assert.equal(requests,mode==='sem avanço'?3:mode==='leitura inválida'?1:2);
      assert.equal(reads,mode==='resultado desconhecido'?1:mode==='sem avanço'?3:2);
      assert.ok(events.some(e=>/incompleta|resultado da ação é desconhecido|verificação falhou/.test(e.text)));
    }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
  });
});
test('Ollama usa somente endpoint local e não recebe a chave do DeepSeek',()=>{
  assert.equal(normalizeLocalBase('http://localhost:11434/v1/'),'http://localhost:11434/v1');
  for(const value of ['https://example.com/v1','http://localhost:11434/v1?token=secret','file:///v1','http://user:secret@localhost:11434/v1','http://localhost:11434/v1/chat/completions'])assert.throws(()=>normalizeLocalBase(value));
  const result=connection({provider:'ollama',key:'deepseek-private-key',model:'deepseek-flash',localModel:'qwen2.5:3b'});
  assert.equal(result.key,'');assert.equal(result.model,'qwen2.5:3b');assert.equal(result.endpoint,'http://localhost:11434/v1/chat/completions');
});
test('normaliza endereços e rejeita protocolos e credenciais',()=>{
  assert.equal(normalizeURL('example.com'),'https://example.com/');
  assert.equal(normalizeURL('http://localhost:3000'),'http://localhost:3000/');
  for(const url of ['file:///C:/secret','javascript:alert(1)','https://user:pass@example.com']) assert.throws(()=>normalizeURL(url));
});
test('executa ferramenta e devolve resultado à API antes de concluir',async()=>{
  const requests=[];
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    requests.push(JSON.parse(body));res.setHeader('Content-Type','application/json');
    const message=requests.length===1 ? {role:'assistant',content:null,tool_calls:[{id:'call_1',type:'function',function:{name:'read_page',arguments:'{}'}}]} : {role:'assistant',content:'Página lida e confirmada.'};
    res.end(JSON.stringify({choices:[{message}]}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const events=[];const calls=[];
  try{
    const history=[{role:'user',content:'Use um tom simpático.'},{role:'assistant',content:'Vou usar um tom simpático.'}];
    await runDeepSeek({key:'test-only',model:'test-model',task:'Leia a página',history,signal:new AbortController().signal,
      endpoint:`http://127.0.0.1:${server.address().port}`,emit:(type,text)=>events.push({type,text}),
      execute:async(name,args)=>{calls.push({name,args});return {text:'Conteúdo de teste'};}});
    assert.equal(requests.length,2);assert.equal(calls[0].name,'read_page');
    assert.deepEqual(requests[0].messages.slice(1,3),history);
    assert.match(requests[0].messages.at(-1).content,/CONTEXTO ATUAL DO NAVEGADOR/);
    assert.match(requests[0].messages.at(-1).content,/Conteúdo de teste/);
    assert.equal(requests[1].messages.at(-1).role,'tool');
    assert.match(requests[1].messages.at(-1).content,/Conteúdo de teste/);
    assert.ok(events.some(e=>e.type==='message' && e.text==='Página lida e confirmada.'));
  } finally {server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('interromper antes da execução impede chamadas de rede',async()=>{
  const controller=new AbortController();controller.abort();
  await assert.rejects(runDeepSeek({key:'test',model:'test',task:'Leia',signal:controller.signal,emit:()=>{},execute:()=>{throw new Error('Não deve executar');}}),{name:'AbortError'});
});
test('payload Ollama omite parâmetros e autorização do DeepSeek',async()=>{
  let request;
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    request={headers:req.headers,body:JSON.parse(body)};
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:mockReply({content:'Resposta local.'},request.body),done:true}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    await runDeepSeek({key:'',provider:'ollama',label:'Ollama',model:'qwen2.5:3b',task:'Olá',endpoint:`http://127.0.0.1:${server.address().port}/v1/chat/completions`,signal:new AbortController().signal,emit:()=>{},execute:()=>{}});
    assert.equal(request.headers.authorization,undefined);assert.equal(request.body.thinking,undefined);assert.ok(request.body.format);assert.equal(request.body.tools,undefined);
    assert.equal(request.body.stream,true);assert.equal(request.body.options.num_ctx,4096);assert.equal(request.body.options.num_predict,512);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('referência inválida recebe nova leitura antes da próxima ação, sem repetir o clique incorreto',async()=>{
  const requests=[];const clicks=[];let reads=0;
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    requests.push(JSON.parse(body));
    const step=requests.length;
    const message=step<3?{role:'assistant',content:null,tool_calls:[{id:`call_${step}`,type:'function',function:{name:'click',arguments:JSON.stringify({id:step===1?2:3})}}]}:{role:'assistant',content:'Aba aberta.'};
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:mockReply(message,requests.at(-1)),done:true}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    await runDeepSeek({key:'',provider:'ollama',label:'Ollama',model:'test',task:'Abra Cadastro',endpoint:`http://127.0.0.1:${server.address().port}`,signal:new AbortController().signal,emit:()=>{},execute:async(name,args)=>{
      if(name==='read_page'){reads++;return {text:'Cadastro',elements:[{id:reads===1?2:3,tag:'button',label:'Cadastro'}]};}
      if(args.id!==3)throw Object.assign(new Error('Elemento não existe mais. Faça nova leitura.'),{code:'ELEMENT_CHANGED',recoverable:true});
      clicks.push(args.id);return 'Ação executada.';
    }});
    assert.equal(reads,3);assert.deepEqual(clicks,[3]);
    const recovery=JSON.parse(requests[1].messages.find(m=>m.content.startsWith('RESULTADO REAL DA ÚLTIMA AÇÃO')).content.split(': ').slice(1).join(': '));
    assert.equal(recovery.code,'ELEMENT_CHANGED');assert.equal(recovery.page.elements[0].id,3);
    assert.match(requests[0].messages.map(m=>m.content).join('\n'),/"id":2,"tag":"button","label":"Cadastro"/);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('promessa de ação sem chamada de ferramenta informa que nada foi executado',async()=>{
  const events=[];const calls=[];
  const server=http.createServer(async(req,res)=>{const request=await readRequest(req);res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:mockReply({content:'Vou tentar abrir a próxima conversa.'},request),done:true}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    await runDeepSeek({key:'',provider:'ollama',label:'Ollama',model:'test',task:'Você consegue clicar?',endpoint:`http://127.0.0.1:${server.address().port}`,signal:new AbortController().signal,emit:(type,text)=>events.push({type,text}),execute:async name=>{calls.push(name);return {text:'Página',elements:[]};}});
    assert.deepEqual(calls,['read_page','read_page']);assert.ok(events.some(e=>e.type==='message' && /incompleta/.test(e.text)));
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('pedido explícito de clique corrige uma falsa conclusão uma vez e exige ferramenta real',async()=>{
  const requests=[],events=[],clicks=[];
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;requests.push(JSON.parse(body));
    const message=requests.length===1?{content:'O botão foi clicado.'}:requests.length===2?{content:'',tool_calls:[{function:{name:'click',arguments:{id:2}}}]}:{content:'Conversa aberta e verificada.'};
    res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:mockReply(message,requests.at(-1)),done:true}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    await runDeepSeek({key:'',provider:'ollama',label:'Ollama',model:'test',task:'Clique no contato de teste. Não envie mensagens.',endpoint:`http://127.0.0.1:${server.address().port}`,signal:new AbortController().signal,emit:(type,text)=>events.push({type,text}),execute:async(name,args)=>{
      if(name==='read_page')return {text:'Contato de teste',elements:[{id:2,tag:'div',label:'Contato de teste'}]};
      clicks.push(args.id);return 'Ação executada.';
    }});
    assert.deepEqual(clicks,[2]);assert.equal(requests.length,3);
    assert.ok(requests[1].messages.some(m=>/Nenhum clique foi executado/.test(m.content)));
    assert.ok(!events.some(e=>e.type==='message' && e.text==='O botão foi clicado.'));
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('resultado desconhecido não aciona nova tentativa automática de clique',async()=>{
  let requests=0,clicks=0;const events=[];
  const server=http.createServer(async(req,res)=>{const request=await readRequest(req);requests++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:mockReply(requests===1?{content:'',tool_calls:[{function:{name:'click',arguments:{id:2}}}]}:{content:'O botão foi clicado.'},request),done:true}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    await runDeepSeek({key:'',provider:'ollama',label:'Ollama',model:'test',task:'Clique no contato de teste.',endpoint:`http://127.0.0.1:${server.address().port}`,signal:new AbortController().signal,emit:(type,text)=>events.push({type,text}),execute:async name=>{
      if(name==='read_page')return {text:'Contato de teste',elements:[{id:2,tag:'div',label:'Contato de teste'}]};
      clicks++;throw Object.assign(new Error('Execução interrompida.'),{code:'EXECUTION_INTERRUPTED',recoverable:false});
    }});
    assert.equal(clicks,1);assert.equal(requests,2);assert.ok(events.some(e=>e.type==='warning' && /resultado da ação é desconhecido/.test(e.text)));
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('modelo que insiste em afirmar clique sem ferramenta encerra com resultado honesto',async()=>{
  let requests=0;const events=[],calls=[];
  const server=http.createServer(async(req,res)=>{const request=await readRequest(req);requests++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:mockReply({content:'O contato foi clicado.'},request),done:true}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    await runDeepSeek({key:'',provider:'ollama',label:'Ollama',model:'test',task:'Clique no contato.',endpoint:`http://127.0.0.1:${server.address().port}`,signal:new AbortController().signal,emit:(type,text)=>events.push({type,text}),execute:async name=>{calls.push(name);return {text:'Contato',elements:[{id:0,tag:'div',label:'Contato'}]};}});
    assert.equal(requests,2);assert.deepEqual(calls,['read_page']);assert.ok(events.some(e=>e.type==='message' && /não executou o clique solicitado/.test(e.text)));
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
test('nome exato único buscado permite encaminhar apenas o clique explicitamente pedido',async()=>{
  let requests=0;const calls=[];
  const server=http.createServer(async(req,res)=>{const request=await readRequest(req);requests++;res.setHeader('Content-Type','application/json');res.end(JSON.stringify({message:mockReply(requests===1?{content:'',tool_calls:[{function:{name:'find_elements',arguments:{text:'Marina'}}}]}:{content:'O contato foi clicado.'},request),done:true}));});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    await runDeepSeek({key:'',provider:'ollama',label:'Ollama',model:'test',task:'Clique em "Marina". Não envie mensagens.',endpoint:`http://127.0.0.1:${server.address().port}`,signal:new AbortController().signal,emit:()=>{},execute:async(name,args)=>{
      calls.push({name,args});
      if(name==='click')return 'Ação executada';
      return {text:'Marina',...(name==='find_elements'?{query:'Marina',matchedCount:1}:{}),elements:[{id:2,label:'Marina',tag:'span'}]};
    }});
    assert.equal(requests,2);assert.deepEqual(calls.filter(c=>c.name==='click').map(c=>c.args),[{id:2}]);assert.equal(calls.at(-1).name,'read_page');
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
});
