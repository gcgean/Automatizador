const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');const http=require('node:http');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
(async()=>{
  let app,requests=0;
  const fixture=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(req.url==='/threads'?'<main><a class="px-page" href="/threads/test">Contato fictício</a></main>':'<div class="page-container"><main><div class="msg-list"><div class="chat chat-start"><div class="chat-bubble">Já conheço nosigilo</div></div></div></main><footer><form><textarea aria-label="Mensagem"></textarea><button disabled>Enviar</button></form></footer></div>');});
  const api=http.createServer((req,res)=>{requests++;res.writeHead(500);res.end();});
  await new Promise(r=>fixture.listen(0,'127.0.0.1',r));await new Promise(r=>api.listen(0,'127.0.0.1',r));
  try{
    app=await electron.launch({args:[path.join(__dirname,'..')],env:{...process.env,NEXO_TEST_PROFILE:fs.mkdtempSync(path.join(os.tmpdir(),'nexo-inbox-'))}});
    const page=await app.firstWindow();page.setDefaultTimeout(20000);await page.getByRole('heading',{name:'O que vamos fazer?'}).waitFor();
    await page.evaluate(async url=>{await window.nexo.config({provider:'deepseek',model:'test',key:'dummy',baseURL:url});window.__events=[];window.nexo.subscribe(e=>window.__events.push(e));},`http://127.0.0.1:${api.address().port}/v1`);
    const root=`http://127.0.0.1:${fixture.address().port}/threads`;
    for(const task of [`para voltar basta ${root}`,'Responda ao contato. Pular quem já tem "nosigilo" no histórico. Depois volte para a lista.']){
      await page.evaluate(url=>window.nexo.navigate(url),root+'/test');
      await page.evaluate(task=>{window.__events=[];window.__run=window.nexo.run({task,mode:'deepseek',review:true});},task);
      await page.waitForFunction(()=>window.__events.some(e=>e.type==='idle'));
      assert.equal(await app.evaluate(({webContents})=>webContents.getAllWebContents().filter(w=>w.getURL().includes('/threads')).map(w=>w.getURL()).at(-1)),root);
      assert.equal(requests,0,'Retorno e exclusão conhecida não consultam o modelo.');
      assert.ok(await page.evaluate(()=>window.__events.some(e=>e.type==='message' && /lista/i.test(e.text))));
      assert.equal(await page.getByRole('button',{name:'Permitir',exact:true}).count(),0);
    }
    console.log('PASS: Nexo retorna à lista por pedido direto e após filtro, com revisão habilitada, sem modelo ou envio.');
  }finally{if(app)await app.close();for(const server of [api,fixture]){server.closeAllConnections();await new Promise(r=>server.close(r));}}
})().catch(e=>{console.error(e);process.exitCode=1;});
