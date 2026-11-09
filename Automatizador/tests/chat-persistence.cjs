const {_electron:electron}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const os=require('node:os');
const http=require('node:http');
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'nexo-chat-e2e-'));
const screenshots=path.join(os.tmpdir(),'nexo-qa-images');fs.mkdirSync(screenshots,{recursive:true});
async function until(fn){for(let i=0;i<100;i++){if(await fn())return;await new Promise(r=>setTimeout(r,100));}throw new Error('Estado esperado não foi atingido.');}
async function launch(){
  const app=await electron.launch({args:[path.join(__dirname,'..')],env:{...process.env,NEXO_TEST_PROFILE:profile}});
  try{
  const page=await app.firstWindow();page.setDefaultTimeout(15000);
  await page.getByRole('heading',{name:'O que vamos fazer?'}).waitFor();
  await page.getByLabel('Chat salvo',{exact:true}).waitFor();
  await until(()=>page.evaluate(async()=>!!(await window.nexo.getChatState()).chat.id && (await window.nexo.getChatState()).ready));
  await app.evaluate(()=>{globalThis.__savedChatRequests=[];globalThis.fetch=async(_url,options)=>{const request=JSON.parse(options.body);globalThis.__savedChatRequests.push(request);return new Response(JSON.stringify({choices:[{message:{role:'assistant',content:`Resposta salva ${globalThis.__savedChatRequests.length}.`}}]}),{headers:{'Content-Type':'application/json'}});};});
  return {app,page};
  }catch(error){await app.close();throw error;}
}
async function send(instance,text){
  const chat=instance.page.getByRole('dialog',{name:'Atividade completa'});
  const before=(await instance.page.evaluate(()=>window.nexo.getChatState())).chat.conversation.length;
  await chat.getByLabel('Mensagem para a IA').fill(text);await chat.getByRole('button',{name:'Enviar mensagem',exact:true}).click();
  await until(()=>instance.page.evaluate(async count=>{const state=await window.nexo.getChatState();return !state.chat.running && state.chat.conversation.length>=count+2 && state.chat.conversation.at(-1)?.role==='assistant';},before));
  await chat.getByRole('button',{name:'Enviar mensagem',exact:true}).waitFor();
}
(async()=>{
  let instance;
  const server=http.createServer((_req,res)=>{res.setHeader('Content-Type','text/html');res.end('<!doctype html><title>Site de continuidade</title><p>Pagina de teste salva.</p>');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  try{
    instance=await launch();
    await instance.page.evaluate(()=>window.nexo.config({key:'fake-test-key',model:'deepseek-flash'}));
    await instance.page.getByRole('button',{name:'Expandir',exact:true}).click();
    await send(instance,'Use um tom simpático e não invente valores.');
    const first=(await instance.page.evaluate(()=>window.nexo.getChatState())).chat;
    const dialog=instance.page.getByRole('dialog',{name:'Atividade completa'});
    await dialog.getByLabel('Nome do chat').fill('Atendimento Marina');await dialog.getByRole('button',{name:'Salvar nome',exact:true}).click();
    await until(()=>instance.page.evaluate(async()=>(await window.nexo.getChatState()).chat.title==='Atendimento Marina'));
    await until(()=>instance.page.evaluate(async()=>(await window.nexo.getChatState()).ready));
    await dialog.getByRole('button',{name:'Nova conversa',exact:true}).click();
    await send(instance,'Esta é outra conversa, sobre pedidos.');
    const second=(await instance.page.evaluate(()=>window.nexo.getChatState())).chat;
    assert.notEqual(first.id,second.id);
    await instance.page.evaluate(url=>window.nexo.navigate(url),`http://127.0.0.1:${server.address().port}/second`);
    await dialog.getByLabel('Mensagem para a IA').fill('Rascunho para continuar amanhã');
    await until(()=>instance.page.evaluate(async()=>(await window.nexo.getChatState()).chat.messageDraft==='Rascunho para continuar amanhã'));
    await instance.app.close();instance=null;
    const record=JSON.parse(fs.readFileSync(path.join(profile,'conversas',`${second.id}.json`),'utf8'));
    assert.equal(record.conversation.length,2);assert.equal(record.messageDraft,'Rascunho para continuar amanhã');assert.ok(!JSON.stringify(record).includes('fake-test-key'));
    assert.ok(fs.existsSync(path.join(profile,'conversas',`${second.id}.md`)));
    instance=await launch();
    let restored=await instance.page.evaluate(()=>window.nexo.getChatState());
    assert.equal(restored.chat.id,second.id);assert.equal(restored.chats.length,2);assert.match(restored.chat.url,/\/second$/);
    await instance.page.getByRole('button',{name:'Expandir',exact:true}).click();
    const restoredDialog=instance.page.getByRole('dialog',{name:'Atividade completa'});
    assert.equal(await restoredDialog.getByLabel('Mensagem para a IA').inputValue(),'Rascunho para continuar amanhã');
    await restoredDialog.locator('.saved-chat-item').filter({hasText:'Atendimento Marina'}).click();
    await until(()=>instance.page.evaluate(async()=>(await window.nexo.getChatState()).chat.title==='Atendimento Marina'));
    restored=await instance.page.evaluate(()=>window.nexo.getChatState());assert.equal(restored.chat.id,first.id);assert.equal(restored.chat.conversation[0].content,'Use um tom simpático e não invente valores.');
    await send(instance,'Continue com as orientações anteriores.');
    assert.equal(await instance.app.evaluate(()=>globalThis.__savedChatRequests.at(-1).messages.some(m=>m.role==='user' && m.content==='Use um tom simpático e não invente valores.')),true);
    assert.equal(await instance.app.evaluate(()=>globalThis.__savedChatRequests.at(-1).messages.some(m=>m.role==='assistant' && m.content==='Resposta salva 1.')),true);
    await instance.page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    await instance.page.screenshot({path:path.join(screenshots,'saved-chats.png')});
    await instance.app.evaluate(()=>{globalThis.fetch=(_url,options)=>new Promise((_resolve,reject)=>{options.signal.addEventListener('abort',()=>reject(new DOMException('Aborted','AbortError')),{once:true});});});
    await restoredDialog.getByLabel('Mensagem para a IA').fill('Uma tarefa que será interrompida.');
    await restoredDialog.getByRole('button',{name:'Enviar mensagem',exact:true}).click();
    await until(()=>instance.page.evaluate(async()=>(await window.nexo.getChatState()).chat.running));
    await assert.rejects(instance.page.evaluate(id=>window.nexo.openChat(id),second.id),/Pare a execução/);
    await instance.app.close();instance=null;
    instance=await launch();restored=await instance.page.evaluate(()=>window.nexo.getChatState());
    assert.equal(restored.chat.running,false);assert.ok(restored.chat.events.some(e=>/interrompida/.test(e.text)));
    assert.equal(await instance.app.evaluate(()=>globalThis.__savedChatRequests.length),0);
    console.log('PASS: chats separados, nome, JSON/Markdown, rascunho e URL restaurados, continuação com contexto após reiniciar, bloqueio durante execução e interrupção sem retomada automática.');
  }finally{if(instance)await instance.app.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
