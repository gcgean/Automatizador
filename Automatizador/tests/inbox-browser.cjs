const {app,BrowserWindow}=require('electron');const http=require('node:http');const assert=require('node:assert/strict');
const {openInbox}=require('../electron/inbox.cjs');
app.whenReady().then(async()=>{
  let empty=false,code=0;
  const server=http.createServer((req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(req.url==='/threads'?(empty?'<main><p data-inbox-empty>Nenhuma conversa</p></main>':'<main>Carregando</main><script>setTimeout(()=>{document.querySelector("main").innerHTML=\'<a class="px-page" href="/threads/a">Contato fictício A</a><a class="px-page" href="/threads/b">Contato fictício B</a><a class="px-page" href="/threads/archived">Arquivadas</a>\'},200)</script>'):'<h1>Conversa fictícia</h1>');});
  const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const root=`http://127.0.0.1:${server.address().port}/threads`;
    await win.loadURL(root+'/a');let page=await openInbox(win.webContents,root);assert.equal(page.url,root);assert.equal(page.inbox.rowCount,2);
    await win.webContents.executeJavaScript(`document.querySelector('a[href="/threads/a"]').innerHTML+=' <span style="background:rgb(239,0,65)">2</span>';document.querySelector('a[href="/threads/b"]').innerHTML+=' <span>3</span>';`);
    page=await require('../electron/browser.cjs').snapshot(win.webContents);
    assert.deepEqual(page.inbox.urls,[root+'/a']);
    assert.equal(page.inbox.unreadOnly,true);
    await win.webContents.executeJavaScript(`document.querySelector('a[href="/threads/a"] span').style.backgroundColor='oklch(60% 0.25 15)';`);
    page=await require('../electron/browser.cjs').snapshot(win.webContents);
    assert.deepEqual(page.inbox.urls,[root+'/a']);
    empty=true;await win.loadURL(root+'/b');page=await openInbox(win.webContents,root);assert.equal(page.inbox.empty,true);assert.equal(page.inbox.rowCount,0);
    console.log('PASS: retorno real à rota da lista, carregamento assíncrono verificado, arquivo não contado como contato e lista vazia confirmada.');
  }catch(error){console.error(error);code=1;}
  finally{win.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));app.exit(code);}
});

