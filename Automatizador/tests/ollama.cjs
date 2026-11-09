const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
(async()=>{
  const profile=fs.mkdtempSync(path.join(os.tmpdir(),'nexo-ollama-'));
  const app=await electron.launch({args:[path.join(__dirname,'..')],env:{...process.env,NEXO_TEST_PROFILE:profile}});
  try{
    const page=await app.firstWindow();page.setDefaultTimeout(200000);
    await page.getByRole('heading',{name:'O que vamos fazer?'}).waitFor();
    await app.evaluate(async({webContents})=>{
      for(let i=0;i<100;i++){
        const browser=webContents.getAllWebContents().find(w=>w.getURL().endsWith('/demo.html'));
        if(browser && !browser.isLoading())return;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
    });
    await page.getByRole('button',{name:'Configurações'}).click();
    await page.getByLabel('Provedor de IA').selectOption('ollama');
    assert.equal(await page.getByLabel('Modelo',{exact:true}).inputValue(),'qwen2.5:3b');
    assert.equal(await page.getByLabel('Chave da API').count(),0);
    await page.getByRole('button',{name:'Testar conexão'}).click();
    await page.getByText('Conectado ao Ollama. Modelo qwen2.5:3b disponível.',{exact:true}).waitFor();
    const screenshots=path.join(os.tmpdir(),'nexo-qa-images');fs.mkdirSync(screenshots,{recursive:true});
    await page.screenshot({path:path.join(screenshots,'ollama-settings.png')});
    await page.getByRole('button',{name:'Salvar configuração'}).click();
    await page.getByRole('dialog').waitFor({state:'hidden'});
    await page.getByRole('button',{name:'Expandir',exact:true}).click();
    const chat=page.getByRole('dialog',{name:'Atividade completa'});
    if(!process.argv.includes('--row-only')){
    await page.evaluate(()=>{window.__firstPartialAt=0;window.nexo.subscribe(event=>{if(event.type==='partial' && !window.__firstPartialAt)window.__firstPartialAt=Date.now();});});
    const startedAt=Date.now();
    await chat.getByLabel('Mensagem para a IA').fill('Em qual página do navegador estamos? Informe o nome da cliente e o número do pedido visíveis na página, sem clicar nem preencher nada. Responda em português em uma frase.');
    await chat.getByRole('button',{name:'Enviar mensagem',exact:true}).click();
    await chat.locator('.event.message').first().waitFor();
    await chat.getByRole('button',{name:'Enviar mensagem',exact:true}).waitFor();
    const firstResponse=await chat.locator('.event.message').first().innerText();
    assert.match(firstResponse,/Marina/i);assert.match(firstResponse,/1042/);
    const firstPartial=await page.evaluate(()=>window.__firstPartialAt);
    assert.ok(firstPartial>0,'A resposta deve ser exibida durante a geração.');
    console.log(`PASS: Ollama identificou os dados da página sem pedido explícito de ferramenta. Primeiro trecho em ${Math.round((firstPartial-startedAt)/1000)}s; resposta concluída em ${Math.round((Date.now()-startedAt)/1000)}s.`);
    await chat.getByLabel('Mensagem para a IA').fill('Agora use a ferramenta read_page para ler a página atual e me diga o nome completo da cliente e o número do pedido. Não clique nem preencha nada.');
    await chat.getByRole('button',{name:'Enviar mensagem',exact:true}).click();
    await chat.getByText('Lendo a página atual',{exact:true}).first().waitFor();
    await chat.getByRole('button',{name:'Enviar mensagem',exact:true}).waitFor();
    const responses=await chat.locator('.event.message').allTextContents();
    assert.ok(responses.some(text=>/Marina/i.test(text) && /1042/.test(text)),'Modelo deve informar dados realmente lidos.');
    assert.equal(await chat.locator('.event.action').filter({hasText:/Clicando|Preenchendo/}).count(),0);
    await page.screenshot({path:path.join(screenshots,'ollama-chat.png')});
    console.log('PASS: Ollama real chamou read_page e retornou os dados fictícios corretos, sem cliques/envios.');
    await chat.getByLabel('Mensagem para a IA').fill('Clique somente no botão Cadastro para abrir essa aba na página atual. Não preencha nada e não envie mensagens.');
    await chat.getByRole('button',{name:'Enviar mensagem',exact:true}).click();
    await chat.getByRole('button',{name:'Permitir',exact:true}).waitFor();
    await chat.getByRole('button',{name:'Permitir',exact:true}).click();
    await chat.getByRole('button',{name:'Enviar mensagem',exact:true}).waitFor();
    assert.equal(await app.evaluate(async({webContents})=>{
      const browser=webContents.getAllWebContents().find(w=>w.getURL().endsWith('/demo.html'));
      return browser.executeJavaScript('!![...document.querySelectorAll("label")].find(e=>e.innerText==="Nome completo")');
    }),true);
    console.log('PASS: Ollama real clicou em Cadastro com revisão, sem preencher nem enviar dados.');
    }
    await app.evaluate(async({webContents})=>{
      const browser=webContents.getAllWebContents().find(w=>w.getURL().endsWith('/demo.html'));
      await browser.executeJavaScript(`document.title='Caixa de entrada fictícia';document.body.innerHTML='<h1>Caixa de entrada fictícia</h1><div id="fake-chat-row" style="cursor:pointer;padding:20px"><span>Contato de teste</span><span> Mensagem fictícia</span></div>';document.getElementById('fake-chat-row').addEventListener('click',()=>document.querySelector('h1').textContent='Conversa de teste aberta');`);
    });
    await chat.getByLabel('Mensagem para a IA').fill('Use find_elements para localizar o nome "Contato de teste" e clique somente nessa conversa fictícia. Não preencha campos nem envie mensagens.');
    await chat.getByRole('button',{name:'Enviar mensagem',exact:true}).click();
    await chat.getByRole('log').getByText(/^Procurando elementos:/).waitFor();
    await chat.getByRole('button',{name:'Permitir',exact:true}).waitFor();
    await chat.getByRole('button',{name:'Permitir',exact:true}).click();
    let confirmed=false;
    for(let attempt=0;attempt<50;attempt++){
      const heading=await app.evaluate(async({webContents})=>{
        const browser=webContents.getAllWebContents().find(w=>w.getURL().endsWith('/demo.html'));
        return browser.executeJavaScript('document.querySelector("h1").textContent');
      });
      if(heading==='Conversa de teste aberta'){confirmed=true;break;}
      await new Promise(resolve=>setTimeout(resolve,200));
    }
    await page.evaluate(()=>window.nexo.stop());
    await chat.getByRole('button',{name:'Enviar mensagem',exact:true}).waitFor();
    assert.equal(confirmed,true,'A leitura após o clique deve confirmar a conversa aberta. Sem confirmação, não repetir a ação.');
    console.log('PASS: busca e clique confirmados por nova leitura do DOM; teste interrompido após a verificação, sem novos cliques ou envios.');
  } finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
