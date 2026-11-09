const {app,BrowserWindow}=require('electron');
const http=require('node:http');const assert=require('node:assert/strict');
const {snapshot}=require('../electron/browser.cjs');
const {readConversation,assertChatFilter,assertMessageTarget}=require('../electron/conversation.cjs');
const {sendMessage}=require('../electron/send-message.cjs');
const {buildDecisionSchema}=require('../electron/decision.cjs');
const {pageSummary}=require('../electron/context.cjs');
app.whenReady().then(async()=>{
  const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false}});
  const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<aside>Outro contato: nosigilo</aside><section class="page-container"><header><button>Voltar</button></header><main><div class="msg-list"><div class="chat chat-start"><div class="chat-bubble">Oi, vocês atendem amanhã?</div></div></div></main><footer><form onsubmit="event.preventDefault();document.body.dataset.sent=\'yes\'"><textarea placeholder="Enviar mensagem..."></textarea><button>Enviar</button></form></footer></section>');});
  const policy={skipTerms:['nosigilo']};let code=0;
  try{
    await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));await win.loadURL(`http://127.0.0.1:${server.address().port}/threads/test`);
    await win.webContents.executeJavaScript('document.querySelector("main").style.minHeight="1500px";for(let i=0;i<40;i++){const b=document.createElement("button");b.textContent="Menu "+i;document.body.insertBefore(b,document.body.firstChild);}');
    let page=await snapshot(win.webContents,{policy});
    assert.ok(pageSummary(page,true).elements.some(e=>e.tag==='textarea'));assert.ok(pageSummary(page,true).elements.some(e=>e.label==='Enviar'));
    assert.equal(page.chatView.kind,'conversation');
    assert.equal(page.conversation.filter.status,'no_match');assert.equal(page.conversation.firstLoadedDirection,'incoming');
    assert.ok(page.text.startsWith('HISTÓRICO INDIVIDUAL CARREGADO'));assert.ok(page.text.indexOf('atendem amanhã')<page.text.indexOf('Outro contato'));
    await assertChatFilter(win.webContents,policy);
    await win.webContents.executeJavaScript('document.querySelector(".msg-list").insertAdjacentHTML("afterbegin",\'<div class="chat chat-start"><div class="chat-bubble">Já entrei no NOSIGILO.</div></div>\');for(let i=0;i<20;i++)document.querySelector(".msg-list").insertAdjacentHTML("beforeend",\'<div class="chat chat-end"><div class="chat-bubble">Mensagem posterior</div></div>\');');
    page=await snapshot(win.webContents,{policy});assert.equal(page.conversation.filter.skip,true);
    const field=page.elements.find(e=>e.tag==='textarea'),send=page.elements.find(e=>e.label==='Enviar'),back=page.elements.find(e=>e.label==='Voltar');
    const schema=buildDecisionSchema(page);assert.ok(!schema.oneOf.some(b=>b.properties.action.const==='send_message'));
    assert.ok(!schema.oneOf.find(b=>b.properties.action.const==='click').properties.arguments.properties.id.enum.includes(send.id));
    await assert.rejects(assertMessageTarget(win.webContents,{id:field.id},policy),/Conversa pulada/);
    await assert.rejects(assertMessageTarget(win.webContents,{id:send.id},policy),/Conversa pulada/);
    await assertMessageTarget(win.webContents,{id:back.id},policy);
    await assert.rejects(sendMessage(win.webContents,{fieldId:field.id,buttonId:send.id,text:'NÃO DEVE ENVIAR'},()=>{throw new Error('Nenhuma operação pode ser chamada.');},()=>{},policy),/Conversa pulada/);
    assert.equal(await win.webContents.executeJavaScript('document.body.dataset.sent || "no"'),'no');
    await win.webContents.executeJavaScript('document.querySelector(".msg-list").remove()');
    assert.equal((await readConversation(win.webContents,policy)).filter.status,'unknown');
    await assert.rejects(assertChatFilter(win.webContents,policy),/Não consegui isolar/);
    console.log('PASS: filtro só no histórico individual, contexto prioritário, mensagens antigas carregadas, bloqueio de fill/click/envio e falha segura sem histórico.');
  }catch(error){console.error(error);code=1;}
  finally{win.destroy();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));app.exit(code);}
});
