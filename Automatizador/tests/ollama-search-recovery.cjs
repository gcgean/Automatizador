const {app,BrowserWindow}=require('electron');
const http=require('node:http');const assert=require('node:assert/strict');
const {runDeepSeek}=require('../electron/agent.cjs');
const {snapshot,interact}=require('../electron/browser.cjs');
app.whenReady().then(async()=>{
  const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  let proxy,fixture,exitCode=0,requests=0,searches=0,clicks=0;
  try{
    fixture=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<h1>Caixa fictícia</h1><button onclick="document.querySelector(\'h1\').textContent=\'Conversa fictícia aberta\'">Contato fictício</button>');});
    await new Promise(resolve=>fixture.listen(0,'127.0.0.1',resolve));
    await window.loadURL(`http://127.0.0.1:${fixture.address().port}`);
    proxy=http.createServer(async(req,res)=>{
      let body='';for await(const chunk of req)body+=chunk;requests++;
      if(requests===3){
        const payload=JSON.parse(body),actions=payload.format.oneOf.map(b=>b.properties.action.const);
        assert.ok(!actions.includes('find_elements'));assert.ok(!actions.includes('read_page'));
        const response=await fetch('http://localhost:11434/api/chat',{method:'POST',headers:{'Content-Type':'application/json'},body,signal:AbortSignal.timeout(150000)});
        res.writeHead(response.status,{'Content-Type':response.headers.get('content-type')});res.end(await response.text());return;
      }
      res.setHeader('Content-Type','application/json');
      res.end(JSON.stringify({message:{content:JSON.stringify(requests<=2?{action:'find_elements',arguments:{text:'Contato fictício'}}:{action:'done',message:'Conversa fictícia aberta, sem mensagens enviadas.'})},done:true}));
    });
    await new Promise(resolve=>proxy.listen(0,'127.0.0.1',resolve));
    await runDeepSeek({key:'',model:'qwen2.5:3b',provider:'ollama',label:'Ollama',endpoint:`http://127.0.0.1:${proxy.address().port}/v1`,signal:AbortSignal.timeout(180000),task:'Abra a conversa clicando no botão Contato fictício. Não envie mensagens. O contato já está visível na leitura.',emit:(type,text)=>{if(['message','warning'].includes(type))console.log(type+': '+text);},execute:async(name,args)=>{
      if(name==='click'){clicks++;return interact(window.webContents,'click',args);}
      assert.ok(['read_page','find_elements'].includes(name));
      if(name==='find_elements')searches++;
      const page=await snapshot(window.webContents,name==='find_elements'?{query:args.text}:{});
      return {...page,text:page.text+`\nRelógio e notificações dinâmicos: ${requests}/${searches}`};
    }});
    assert.equal(searches,2);assert.equal(clicks,1);
    assert.equal(await window.webContents.executeJavaScript('document.querySelector("h1").textContent'),'Conversa fictícia aberta');
    console.log('PASS: duas buscas simuladas com resultados dinâmicos; Ollama real escolheu o clique no controle atual. DOM confirmou abertura, sem envio.');
  }catch(error){console.error(error);exitCode=1;}
  finally{window.destroy();for(const server of [proxy,fixture])if(server){server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}app.exit(exitCode);}
});
