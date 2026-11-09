const {app,BrowserWindow}=require('electron');
const http=require('node:http');const assert=require('node:assert/strict');
const {snapshot,interact}=require('../electron/browser.cjs');
const {pageSummary}=require('../electron/context.cjs');
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<h1>Inbox ficticio</h1><input type="search" aria-label="Pesquisar contatos"><textarea style="display:none"></textarea><button onclick="document.querySelector(\'textarea\').style.display=\'block\'">Pessoa ficticia</button>');});
  let code=0;
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));await win.loadURL(`http://127.0.0.1:${server.address().port}/threads`);
    const inbox=await snapshot(win.webContents);assert.equal(inbox.chatView.kind,'inbox');
    assert.equal(pageSummary(inbox,true).chatView.kind,'inbox');
    await interact(win.webContents,'click',{id:inbox.elements.find(e=>e.tag==='button').id});
    assert.equal((await snapshot(win.webContents)).chatView.kind,'conversation');
    console.log('PASS: inbox com campo de busca e editor oculto não equivale a conversa aberta; editor visível muda a identificação.');
  }catch(error){console.error(error);code=1;}
  finally{win.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));app.exit(code);}
});
