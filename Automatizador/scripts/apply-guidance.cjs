const {_electron:electron}=require('playwright');
const fs=require('node:fs');const path=require('node:path');
const chatArg=process.argv.indexOf('--chat'),expectedChat=chatArg>=0?process.argv[chatArg+1]:'';
if(!process.argv.includes('--live') || !/^[0-9a-f-]{36}$/i.test(expectedChat)){console.error('Use --live --chat <id> para atualizar orientações do perfil real sem executar tarefas.');process.exit(2);}
(async()=>{
  const guidance=fs.readFileSync(path.join(__dirname,'../orientacoes-ia.txt'),'utf8').trim();
  const app=await electron.launch({args:[path.join(__dirname,'..')]});
  try{
    const page=await app.firstWindow();page.setDefaultTimeout(20000);
    await page.getByRole('heading',{name:'O que vamos fazer?'}).waitFor();
    const state=await page.evaluate(()=>window.nexo.getChatState());
    if(state.chat.id!==expectedChat || state.chat.running)throw new Error('O chat atual mudou ou está em execução. Nada foi alterado.');
    const backup=path.join(__dirname,'../design',`orientacoes-anteriores-${expectedChat}.txt`);
    try{fs.writeFileSync(backup,state.chat.draft || '',{flag:'wx'});}catch(error){if(error.code!=='EEXIST')throw error;}
    const saved=await page.evaluate(({id,text})=>window.nexo.saveGuidance({id,text}),{id:expectedChat,text:guidance});
    await page.waitForFunction(text=>[...document.querySelectorAll('textarea')].some(e=>e.value===text),guidance);
    const config=await page.evaluate(()=>window.nexo.getConfig());
    console.log(JSON.stringify({chatId:saved.chat.id,guidanceSaved:true,characters:saved.chat.draft.length,historyPreserved:saved.chat.conversation.length>=state.chat.conversation.length,running:saved.chat.running,review:saved.chat.review,provider:config.provider,model:config.model}));
    await new Promise(resolve=>app.on('close',resolve));
  }catch(error){await app.close();throw error;}
})().catch(error=>{console.error(error);process.exitCode=1;});
