const {_electron:electron}=require('playwright');
const path=require('node:path');
if(!process.argv.includes('--live')){console.error('Use --live para configurar o perfil real do Nexo.');process.exit(2);}
(async()=>{
  const app=await electron.launch({args:[path.join(__dirname,'..')]});
  const page=await app.firstWindow();page.setDefaultTimeout(20000);
  await page.getByRole('heading',{name:'O que vamos fazer?'}).waitFor();
  const config=await page.evaluate(async()=>{
    const current=await window.nexo.getConfig();
    await window.nexo.config({provider:'deepseek',model:'deepseek-flash',key:'',clearKey:false,baseURL:current.baseURL});
    return window.nexo.getConfig();
  });
  await page.getByRole('button',{name:'Configurações',exact:true}).click();
  await page.getByLabel('Chave da API',{exact:true}).waitFor();
  console.log(JSON.stringify({provider:config.provider,model:config.model,hasKey:config.hasKey,settingsOpen:true}));
  await new Promise(resolve=>app.on('close',resolve));
})().catch(error=>{console.error(error);process.exitCode=1;});
