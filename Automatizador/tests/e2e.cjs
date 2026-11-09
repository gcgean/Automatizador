const {_electron:electron} = require('playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
(async()=>{
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'nexo-qa-'));
  const screenshots=process.env.NEXO_QA_OUTPUT || path.join(os.tmpdir(),'nexo-qa-images');
  fs.mkdirSync(screenshots,{recursive:true});
  const app=await electron.launch({args:[path.join(__dirname,'..')],env:{...process.env,NEXO_TEST_PROFILE:profile}});
  app.process().stderr.on('data',chunk=>process.stderr.write(chunk));
  try {
    const page=await app.firstWindow();page.setDefaultTimeout(15000);const errors=[];
    async function capture(name) {
      const base64=await app.evaluate(async({BrowserWindow})=>(await BrowserWindow.getAllWindows()[0].capturePage()).toPNG().toString('base64'));
      fs.writeFileSync(path.join(screenshots,name),Buffer.from(base64,'base64'));
      const browserImage=await app.evaluate(async({webContents})=>{
        const browser=webContents.getAllWebContents().find(w=>w.getURL().endsWith('/demo.html'));
        return (await browser.capturePage()).toPNG().toString('base64');
      });
      fs.writeFileSync(path.join(screenshots,name.replace('.png','-browser.png')),Buffer.from(browserImage,'base64'));
    }
    page.on('pageerror',e=>errors.push(e.message));
    await page.getByRole('heading',{name:'O que vamos fazer?'}).waitFor();
    await app.evaluate(async({webContents})=>{
      for(let i=0;i<100;i++) {
        const browser=webContents.getAllWebContents().find(w=>w.getURL().endsWith('/demo.html'));
        if(browser && !browser.isLoading() && await browser.executeJavaScript('!!document.querySelector("textarea")'))return;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      throw new Error('Página de demonstração não carregou');
    });
    assert.equal(await app.evaluate(({BrowserWindow})=>{
      const view=BrowserWindow.getAllWindows()[0].contentView.children.find(v=>v.webContents?.getURL().endsWith('/demo.html'));
      return !!view && view.getVisible() && view.getBounds().width > 300;
    }),true);
    await capture('desktop.png');
    const longMessage='Início da resposta longa.\n'+('Detalhes da atividade para leitura completa.\n'.repeat(100))+'Fim da resposta longa.';
    await app.evaluate(({BrowserWindow},text)=>BrowserWindow.getAllWindows()[0].webContents.send('nexo:event',{type:'message',text}),longMessage);
    await page.getByRole('button',{name:'Expandir',exact:true}).click();
    const history=page.getByRole('dialog',{name:'Atividade completa'});
    await history.waitFor();
    await app.evaluate(({BrowserWindow})=>{
      const contents=BrowserWindow.getAllWindows()[0].webContents;
      contents.send('nexo:event',{type:'partial',id:'test-stream',text:'Resposta em andamento'});
    });
    await history.getByText('Resposta em andamento',{exact:true}).waitFor();
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('nexo:event',{type:'message',id:'test-stream',text:'Resposta completa sem duplicar a mensagem.'}));
    await history.getByText('Resposta completa sem duplicar a mensagem.',{exact:true}).waitFor();
    assert.equal(await history.getByText('Resposta em andamento',{exact:true}).count(),0);
    assert.equal(await history.getByText('Resposta completa sem duplicar a mensagem.',{exact:true}).count(),1);
    assert.ok((await history.innerText()).includes('Fim da resposta longa.'));
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children.find(v=>v.webContents?.getURL().endsWith('/demo.html')).getVisible()),false);
    await history.getByRole('log').evaluate(node=>{node.scrollTop=0;node.dispatchEvent(new Event('scroll'));});
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].webContents.send('nexo:event',{type:'message',text:'Nova atividade durante a leitura.'}));
    await history.getByText('Nova atividade durante a leitura.',{exact:true}).waitFor({state:'attached'});
    assert.equal(await history.getByRole('log').evaluate(node=>node.scrollTop),0);
    await capture('activity-expanded.png');
    await page.keyboard.press('Escape');
    await history.waitFor({state:'hidden'});
    assert.equal(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].contentView.children.find(v=>v.webContents?.getURL().endsWith('/demo.html')).getVisible()),true);
    await page.getByRole('button',{name:'Executar tarefa'}).click();
    for(let i=0;i<3;i++) {
      await page.getByRole('button',{name:'Permitir',exact:true}).waitFor({timeout:15000});
      await page.getByRole('button',{name:'Permitir',exact:true}).click();
      await new Promise(resolve=>setTimeout(resolve,700));
    }
    await page.getByText('Demonstração concluída:',{exact:false}).waitFor({timeout:15000});
    const state=await app.evaluate(async({webContents})=>{
      const browser=webContents.getAllWebContents().find(w=>w.getURL().endsWith('/demo.html'));
      return browser.executeJavaScript(`({text:document.body.innerText,name:document.querySelector('input')?.value,email:document.querySelector('input[type="email"]')?.value,node:typeof require})`);
    });
    assert.match(state.text,/Cadastro salvo com sucesso/);assert.match(state.text,/Resposta enviada/);
    assert.equal(state.name,'Marina Alves');assert.equal(state.email,'marina@example.com');assert.equal(state.node,'undefined');
    await capture('completed.png');
    await page.getByRole('button',{name:'Configurações'}).click();
    await page.getByRole('dialog').waitFor();
    await page.getByLabel('Chave da API').fill('test-key-never-used');
    await page.getByRole('button',{name:'Salvar configuração'}).click();
    assert.equal(await page.evaluate(()=>window.nexo.getConfig()).then(c=>c.hasKey),true);
    // The isolated test process simulates the API; no real messages or API calls.
    await app.evaluate(()=>{
      globalThis.__chatRequests=[];
      globalThis.fetch=async(url,options)=>{
        if(url!=='https://api.deepseek.com/chat/completions')throw new Error('Unexpected API URL');
        globalThis.__chatRequests.push(JSON.parse(options.body));
        return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:`Orientação recebida ${globalThis.__chatRequests.length}.`}}]}),{status:200,headers:{'Content-Type':'application/json'}});
      };
    });
    await page.getByRole('button',{name:'Expandir',exact:true}).click();
    const chat=page.getByRole('dialog',{name:'Atividade completa'});
    await chat.getByLabel('Mensagem para a IA').fill('Use um tom simpático.');
    await chat.getByRole('button',{name:'Enviar mensagem',exact:true}).click();
    await chat.getByRole('log').getByText('Orientação recebida 1.',{exact:true}).waitFor();
    await chat.getByLabel('Mensagem para a IA').fill('Agora use respostas curtas.');
    await chat.getByRole('button',{name:'Enviar mensagem',exact:true}).click();
    await chat.getByRole('log').getByText('Orientação recebida 2.',{exact:true}).waitFor();
    assert.equal(await app.evaluate(()=>globalThis.__chatRequests[1].messages.some(m=>m.role==='user' && m.content==='Use um tom simpático.')),true);
    assert.equal(await app.evaluate(()=>globalThis.__chatRequests[1].messages.some(m=>m.role==='assistant' && m.content==='Orientação recebida 1.')),true);
    await capture('chat-conversation.png');
    await chat.getByRole('button',{name:'Nova conversa',exact:true}).click();
    await chat.getByText('Nova conversa iniciada.',{exact:true}).waitFor();
    await chat.getByLabel('Mensagem para a IA').fill('Comece uma conversa nova.');
    await chat.getByRole('button',{name:'Enviar mensagem',exact:true}).click();
    await chat.getByRole('log').getByText('Orientação recebida 3.',{exact:true}).waitFor();
    assert.equal(await app.evaluate(()=>globalThis.__chatRequests[2].messages.length),2);
    await chat.getByRole('button',{name:'Fechar',exact:true}).click();
    await page.getByLabel('Modo de execução').selectOption('demo');
    await page.getByRole('button',{name:'Executar tarefa'}).click();
    await page.getByRole('button',{name:'Permitir',exact:true}).waitFor();
    await page.getByRole('button',{name:'Parar tarefa',exact:true}).click();
    await page.getByText('Tarefa interrompida.',{exact:false}).waitFor();
    await page.getByLabel('Modo de execução').selectOption('deepseek');
    await page.getByRole('button',{name:'Configurações'}).click();
    await page.getByRole('button',{name:'Remover chave salva'}).click();
    await page.getByLabel('Sua tarefa',{exact:true}).fill('Teste da ausência de chave.');
    await page.getByRole('button',{name:'Executar tarefa'}).click();
    await page.getByText('Informe sua chave do DeepSeek em Configurações.',{exact:false}).waitFor();
    await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows()[0].setContentSize(980,760));
    await new Promise(resolve=>setTimeout(resolve,500));
    await capture('compact.png');
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
    assert.equal(overflow,false);assert.deepEqual(errors,[]);
    console.log(JSON.stringify({result:'PASS',checks:['demo send/save','approval','stop','config','missing key','sandbox','compact layout','no renderer errors'],screenshots}));
  } finally {await app.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
