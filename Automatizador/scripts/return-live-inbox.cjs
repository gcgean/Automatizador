const {_electron:electron}=require('playwright');const path=require('node:path');
const chatArg=process.argv.indexOf('--chat'),expectedChat=chatArg>=0?process.argv[chatArg+1]:'';
if(!process.argv.includes('--live') || !/^[0-9a-f-]{36}$/i.test(expectedChat)){console.error('Use --live --chat <id> para retornar à lista no perfil atual, sem enviar mensagens.');process.exit(2);}
(async()=>{
  const app=await electron.launch({args:[path.join(__dirname,'..')]});
  try{
    const page=await app.firstWindow();page.setDefaultTimeout(20000);await page.getByRole('heading',{name:'O que vamos fazer?'}).waitFor();
    await page.waitForTimeout(1000);
    const state=await page.evaluate(()=>window.nexo.getChatState());
    if(state.chat.id!==expectedChat || state.chat.running)throw new Error('O chat mudou ou está em execução. Retorno não iniciado.');
    await page.evaluate(()=>{window.__returnEvents=[];window.nexo.subscribe(e=>window.__returnEvents.push(e));});
    let started=false;
    for(let attempt=0;attempt<30 && !started;attempt++){
      try{await page.evaluate(()=>window.nexo.run({task:'Volte para a lista https://d4swing.com/threads',mode:'deepseek',review:true}));started=true;}
      catch(error){if(!error.message.includes('O navegador está carregando'))throw error;await page.waitForTimeout(1000);}
    }
    if(!started)throw new Error('O navegador não terminou de restaurar a sessão. Nenhuma tarefa foi iniciada.');
    await page.waitForFunction(()=>window.__returnEvents.some(e=>e.type==='idle'),null,{timeout:40000});
    const result=await app.evaluate(async({webContents})=>{
      const browser=webContents.getAllWebContents().find(w=>w.getURL().startsWith('https://d4swing.com/'));
      if(!browser)return {found:false};
      const count=await browser.executeJavaScript('Array.from(document.querySelectorAll("a.px-page[href]")).filter(e=>/^\\/threads\\/[^/]+$/.test(new URL(e.href).pathname)&&!/[\\/](archived|archive)$/.test(new URL(e.href).pathname)).length');
      return {url:browser.getURL(),rows:count};
    });
    const config=await page.evaluate(()=>window.nexo.getConfig());
    const after=await page.evaluate(()=>window.nexo.getChatState());
    console.log(JSON.stringify({...result,provider:config.provider,model:config.model,draftPreserved:after.chat.draft===state.chat.draft,running:after.chat.running}));
    if(result.url!=='https://d4swing.com/threads' || !result.rows)throw new Error('Lista real não confirmada. Nenhuma mensagem foi enviada.');
    await new Promise(resolve=>app.on('close',resolve));
  }catch(error){
    try{console.log(JSON.stringify(await app.evaluate(({webContents})=>webContents.getAllWebContents().map(w=>({url:w.getURL(),loading:w.isLoading()})))));}catch{}
    await app.close();throw error;
  }
})().catch(error=>{console.error(error);process.exitCode=1;});
