const {_electron:electron}=require('playwright');
const path=require('node:path');
const {conversationSource}=require('../electron/conversation.cjs');
if(!process.argv.includes('--live')){console.error('Diagnóstico do perfil real: use --live explicitamente. Não faz parte dos testes automatizados.');process.exit(2);}
(async()=>{
  const app=await electron.launch({args:[path.join(__dirname,'..')]});
  try{
    await app.firstWindow();
    const result=await app.evaluate(async({webContents},options)=>{
      const openFirst=options.openFirst;
      let contents;
      for(let i=0;i<100;i++){
        contents=webContents.getAllWebContents().find(w=>/https:\/\/d4swing\.com\/threads/.test(w.getURL()));
        if(contents && !contents.isLoading())break;
        await new Promise(resolve=>setTimeout(resolve,100));
      }
      if(!contents)return {status:'Página de conversas não encontrada; nenhuma ação foi executada.'};
      for(let i=0;i<80;i++){
        if(await contents.executeJavaScript('document.querySelectorAll("a").length>20'))break;
        await new Promise(resolve=>setTimeout(resolve,150));
      }
      if(openFirst){
        const opened=await contents.executeJavaScript(`(() => {
          const row=[...document.querySelectorAll('a[href]')].find(e=>e.classList.contains('px-page') && /^\\/threads\\/[^/]+$/.test(new URL(e.href).pathname) && e.getClientRects().length && e.getBoundingClientRect().top<innerHeight);
          if(!row)return false;row.click();return true;
        })()`);
        if(!opened)return {status:'Nenhuma linha de conversa identificada; nada foi clicado.'};
        for(let i=0;i<100;i++){
          if(await contents.executeJavaScript('!![...document.querySelectorAll("textarea,[contenteditable=true],input[type=text]")].find(e=>e.getClientRects().length)'))break;
          await new Promise(resolve=>setTimeout(resolve,150));
        }
      }
      for(let i=0;i<20;i++){
        const ready=await contents.executeJavaScript('!![...document.querySelectorAll("textarea")].find(e=>e.getClientRects().length && (e.closest(".page-container")?.innerText.length || 0)>100)');
        if(ready)break;await new Promise(resolve=>setTimeout(resolve,150));
      }
      const raw=await contents.executeJavaScript(options.source);
      const filterInspection={scope:raw.scope,loadedMessages:raw.messages.length,containsExcludedTerm:raw.messages.some(m=>m.text.toLowerCase().includes('nosigilo'))};
      const structure=await contents.executeJavaScript(`(() => {
        const visible=e=>e.getClientRects().length && getComputedStyle(e).visibility!=='hidden';
        const meta=e=>({tag:e.tagName,id:e.id,classes:String(e.className),role:e.getAttribute('role'),type:e.type,placeholder:e.placeholder,ariaLabel:e.getAttribute('aria-label'),children:e.children.length,scrollHeight:e.scrollHeight,clientHeight:e.clientHeight});
        const editors=[...document.querySelectorAll('textarea,input,[contenteditable="true"]')].filter(visible);
        const root=editors.find(e=>e.tagName==='TEXTAREA')?.closest('.page-container');
        return {status:'Inspeção somente de estrutura; nenhum texto de mensagem ou valor de campo foi exportado.',threadOpen:/^\\/threads\\/[^/]+$/.test(location.pathname),editors:editors.map(meta),editorAncestors:editors.map(e=>{const list=[];for(let p=e.parentElement;p && list.length<6;p=p.parentElement)list.push(meta(p));return list;}),rootChildren:root?[...root.children].map(e=>({...meta(e),descendants:[...e.children].slice(0,8).map(c=>({...meta(c),childNodes:[...c.children].slice(0,5).map(meta)}))})):[],chatContainers:[...document.querySelectorAll('[role="log"],[class*="message"],[class*="thread"],[class*="chat"]')].filter(visible).slice(0,25).map(meta)};
      })()`);
      return {...structure,filterInspection};
    },{openFirst:process.argv.includes('--open-first-thread'),source:conversationSource()});
    console.log(JSON.stringify(result));
  }finally{await app.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
