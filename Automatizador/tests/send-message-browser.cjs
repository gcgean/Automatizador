const {app,BrowserWindow}=require('electron');
const assert=require('node:assert/strict');
const {snapshot,interact}=require('../electron/browser.cjs');
const {sendMessage}=require('../electron/send-message.cjs');
app.whenReady().then(async()=>{
  const window=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  let exitCode=0;
  try{
    for(const mode of ['delayed','success','changed-button','uncertain','rejected','search-field','disabled-until-filled','stays-disabled']){
      const html='<label>Mensagem<input '+(mode==='search-field'?'type="search" ':'')+'aria-label="Mensagem"></label><button onclick="document.body.dataset.clicks=String(Number(document.body.dataset.clicks||0)+1);'+(mode==='success'?'document.querySelector(\'output\').textContent=document.querySelector(\'input\').value;document.querySelector(\'input\').value=\'\';':'')+'">Enviar</button><output></output>';
      await window.loadURL('data:text/html;charset=utf-8,'+encodeURIComponent(html));
      if(['disabled-until-filled','stays-disabled'].includes(mode))await window.webContents.executeJavaScript('document.querySelector("button").disabled=true;');
      if(mode==='disabled-until-filled')await window.webContents.executeJavaScript('document.querySelector("input").addEventListener("input",()=>{document.querySelector("button").disabled=!document.querySelector("input").value.trim()});document.querySelector("button").onclick=()=>{document.body.dataset.clicks="1";document.querySelector("output").textContent=document.querySelector("input").value;document.querySelector("input").value="";};void 0;');
      if(mode==='delayed')await window.webContents.executeJavaScript('document.querySelector("button").onclick=()=>{document.body.dataset.clicks=String(Number(document.body.dataset.clicks||0)+1);setTimeout(()=>{document.querySelector("output").textContent=document.querySelector("input").value;document.querySelector("input").value="";},700);};void 0;');
      const page=await snapshot(window.webContents),calls=[];
      const field=page.elements.find(e=>e.tag==='input'),button=page.elements.find(e=>e.tag==='button');
      const execute=async(name,args)=>{
        calls.push(name);
        if(name==='read_page')return snapshot(window.webContents);
        if(name==='click' && mode==='rejected')throw new Error('Ação recusada.');
        const result=await interact(window.webContents,name,args);
        if(name==='fill' && mode==='changed-button')await window.webContents.executeJavaScript('document.querySelector("button").replaceWith(document.querySelector("button").cloneNode(true))');
        return result;
      };
      const operation=sendMessage(window.webContents,{fieldId:field.id,buttonId:button.id,text:'TESTE FICTÍCIO'},execute);
      if(['changed-button','rejected','search-field','stays-disabled'].includes(mode))await assert.rejects(operation,/mudaram|recusada|campo indicado|não está disponível/);
      else{
        const result=await operation;assert.equal(result.sent,['delayed','success','disabled-until-filled'].includes(mode));
        assert.equal(calls.filter(n=>n==='click').length,1);
      }
      const clicks=await window.webContents.executeJavaScript('Number(document.body.dataset.clicks||0)');
      assert.equal(clicks,['delayed','success','uncertain','disabled-until-filled'].includes(mode)?1:0);
      if(mode==='stays-disabled')assert.equal(calls.includes('click'),false);
      if(mode==='changed-button')assert.equal(calls.includes('click'),false);
    }
    console.log('PASS: envio único e confirmação, troca de controles bloqueada, clique recusado preservado e resultado incerto sem repetição.');
  }catch(error){console.error(error);exitCode=1;}
  finally{window.destroy();app.exit(exitCode);}
});
