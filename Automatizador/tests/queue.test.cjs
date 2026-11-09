const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runDeepSeek}=require('../electron/agent.cjs');
test('fila visita cada conversa uma vez e continua após exclusão comprovada',async()=>{
 const urls=['https://example.test/threads/a','https://example.test/threads/b'];let current='https://example.test/threads';const visited=[];
 await runDeepSeek({task:'Responda todas as conversas. Pular quem tem "nosigilo".',signal:new AbortController().signal,emit:()=>{},execute:async(name,args)=>{
 if(name==='navigate'){current=args.url;visited.push(current);return {};}
 if(name==='return_to_inbox'){current='https://example.test/threads';return {url:current,text:'Lista',inbox:{urls,rowCount:2}};}
 return current.endsWith('/threads')?{url:current,text:'Lista',inbox:{urls:[...urls,urls[0]],rowCount:3}}:{url:current,text:'Histórico',elements:[],conversation:{filter:{status:'skip'}}};
 }});assert.deepEqual(visited,[...urls].reverse());
});
test('tarefa em lote iniciada numa conversa prepara a lista e segue os outros destinatários',async()=>{
 const list='https://example.test/threads',urls=[list+'/a',list+'/b'];let current=urls[1];const visited=[];
 await runDeepSeek({task:'Modelo de mensagem aprovado: comunidade. Enviar automaticamente. Responda. Pular quem tem "nosigilo".',signal:new AbortController().signal,emit:()=>{},execute:async(name,args)=>{
 if(name==='navigate'){current=args.url;visited.push(current);return {};}
 if(name==='return_to_inbox'){current=list;return {url:list,text:'Lista',inbox:{urls,rowCount:2}};}
 return current===list?{url:list,text:'Lista',inbox:{urls,rowCount:2}}:{url:current,text:'Histórico',elements:[],conversation:{filter:{status:'skip'}}};
 }});assert.deepEqual(visited,[urls[1],urls[0]]);
});
test('fila continua após resposta sem ação e para após envio incerto',async()=>{
 const http=require('node:http');
 for(const attempt of [false,true]){
 const server=http.createServer((req,res)=>{req.resume();res.setHeader('Content-Type','application/json');res.end(JSON.stringify({choices:[{message:attempt?{tool_calls:[{id:'send',type:'function',function:{name:'send_message',arguments:JSON.stringify({fieldId:1,buttonId:2,text:'Olá'})}}]}:{content:'Não tenho uma resposta apropriada para esta conversa.'}}]}));});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
 const list='https://example.test/threads',urls=[list+'/a',list+'/b'];let current=list;const visited=[],events=[];
 await runDeepSeek({task:'Responda as conversas.',provider:'deepseek',endpoint:'http://127.0.0.1:'+server.address().port,signal:new AbortController().signal,emit:(type,text)=>events.push(text),execute:async(name,args)=>{
 if(name==='navigate'){current=args.url;visited.push(current);return {};}
 if(name==='send_message')return {sent:false,uncertain:true};
 if(name==='return_to_inbox')current=list;
 return current===list?{url:list,text:'Lista',inbox:{urls,rowCount:2}}:{url:current,text:'Olá',chatView:{kind:'conversation'},elements:[{id:1,tag:'textarea'},{id:2,tag:'button'}]};
 }});
 assert.deepEqual(visited,attempt?[urls[1]]:[...urls].reverse());
 assert.ok(events.some(t=>t.includes(attempt?'Atendimento interrompido':'2 pendente(s)')));
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
 }
});
test('paginação acrescenta novos destinatários sem repetir os já visitados',async()=>{
 const list='https://example.test/threads',urls=[list+'/a',list+'/b'];let current=list,loads=0;const visited=[];
 await runDeepSeek({task:'Responda todas as conversas. Pular quem tem "nosigilo".',signal:new AbortController().signal,emit:()=>{},execute:async(name,args)=>{
 if(name==='navigate'){current=args.url;visited.push(current);return {};}
 if(name==='load_more_inbox'){assert.equal(visited.length,0);loads++;return {url:list,text:'Lista',inbox:{urls:loads===1?urls:[...urls],pagination:true},paginationExhausted:loads>1};}
 if(name==='return_to_inbox')current=list;
 return current===list?{url:list,text:'Lista',inbox:{urls:[urls[0]],pagination:true}}:{url:current,text:'Histórico',elements:[],conversation:{filter:{status:'skip'}}};
 }});assert.deepEqual(visited,[...urls].reverse());assert.equal(loads,2);
});
test('coleta incompleta atende a fila disponível e informa a limitação',async()=>{
 const calls=[],events=[];let current='https://example.test/threads';
 await runDeepSeek({task:'Responda todas as conversas. Pular quem tem "nosigilo".',signal:new AbortController().signal,emit:(type,text)=>events.push(text),execute:async(name,args)=>{
 calls.push(name);if(name==='navigate')current=args.url;
 if(name==='read_page' && current.endsWith('/a'))return {url:current,text:'Histórico',conversation:{filter:{status:'skip'}},elements:[]};
 return {url:'https://example.test/threads',text:'Lista',inbox:{urls:['https://example.test/threads/a'],pagination:true},paginationUnconfirmed:name==='load_more_inbox'};
 }});
 assert.ok(calls.includes('navigate'));assert.ok(events.some(t=>t.includes('Pode haver outras fora desta coleta')));
});
