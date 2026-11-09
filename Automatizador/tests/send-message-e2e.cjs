const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const http=require('node:http');
const fs=require('node:fs');const os=require('node:os');const path=require('node:path');
(async()=>{
  const server=http.createServer(async(req,res)=>{
    let body='';for await(const chunk of req)body+=chunk;
    const request=JSON.parse(body);
    const context=request.messages.find(m=>m.content.startsWith('CONTEXTO ATUAL DO NAVEGADOR'));
    const page=JSON.parse(context.content.slice(context.content.indexOf('\n')+1));
    const field=page.elements.find(e=>e.label==='Sua resposta');
    const button=page.elements.find(e=>e.label==='Enviar resposta');
    assert.ok(request.format);assert.ok(field && button);
    res.setHeader('Content-Type','application/json');
    res.end(JSON.stringify({message:{content:JSON.stringify({action:'send_message',arguments:{fieldId:field.id,buttonId:button.id,text:'TESTE E2E FICTÍCIO'}})},done:true}));
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'nexo-send-e2e-'));
  let app;
  try{
    app=await electron.launch({args:[path.join(__dirname,'..')],env:{...process.env,NEXO_TEST_PROFILE:profile}});
    const page=await app.firstWindow();page.setDefaultTimeout(15000);
    await page.getByRole('heading',{name:'O que vamos fazer?'}).waitFor();
    await page.evaluate(async baseURL=>{
      await window.nexo.config({provider:'ollama',model:'test',key:'',baseURL});
      window.__events=[];window.nexo.subscribe(event=>window.__events.push(event));
    },`http://127.0.0.1:${server.address().port}/v1`);
    await page.evaluate(()=>{window.__sendRun=window.nexo.run({task:'Personalize a resposta para Marina com o texto fictício indicado e conclua a tarefa.',mode:'deepseek',review:true});});
    await page.getByRole('button',{name:'Permitir',exact:true}).waitFor();
    const before=await app.evaluate(async({webContents})=>webContents.getAllWebContents().find(w=>w.getURL().endsWith('/demo.html')).executeJavaScript('document.body.innerText'));
    assert.ok(!before.includes('Resposta enviada'));
    await page.getByRole('button',{name:'Permitir',exact:true}).click();
    await page.evaluate(()=>window.__sendRun);
    const after=await app.evaluate(async({webContents})=>webContents.getAllWebContents().find(w=>w.getURL().endsWith('/demo.html')).executeJavaScript('({text:document.body.innerText,value:document.querySelector("textarea").value})'));
    assert.match(after.text,/Resposta enviada · 1 mensagem/);assert.match(after.text,/TESTE E2E FICTÍCIO/);assert.equal(after.value,'');
    await page.waitForFunction(()=>window.__events.some(e=>e.type==='message' && /Mensagem enviada uma vez e confirmada/.test(e.text)),null,{timeout:3000}).catch(async error=>{console.error(await page.evaluate(()=>window.__events.filter(e=>['warning','error','message'].includes(e.type))));throw error;});
    console.log('PASS: ferramenta de envio no Nexo, revisão antes do clique, uma mensagem no React e confirmação por leitura.');
  }finally{if(app)await app.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
