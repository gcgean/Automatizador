const {app,BrowserWindow}=require('electron');const assert=require('node:assert/strict');const {primaryInboxSource}=require('../electron/inbox-root.cjs');
app.whenReady().then(async()=>{const win=new BrowserWindow({show:false});let code=0;try{
 await win.loadURL('data:text/html,'+encodeURIComponent('<main style="width:600px;height:100px;overflow:auto"><a class="px-page" href="/threads/a" style="display:block;height:500px">Principal</a></main><aside style="width:150px;height:100px;overflow:auto"><a class="px-page" href="/threads/b" style="display:block;height:500px">Lateral</a></aside>'));
 const state=await win.webContents.executeJavaScript('(()=>{'+primaryInboxSource+'primaryInbox.box.scrollTop=primaryInbox.box.scrollHeight;return {root:primaryInbox.root.tagName,main:document.querySelector("main").scrollTop,side:document.querySelector("aside").scrollTop};})()');
 assert.equal(state.root,'MAIN');assert.ok(state.main>0);assert.equal(state.side,0);console.log('PASS: rolagem da lista principal com painel lateral preservado.');
 }catch(e){console.error(e);code=1;}finally{win.destroy();app.exit(code);}});
