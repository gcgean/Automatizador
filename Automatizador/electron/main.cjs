const { app, BrowserWindow, WebContentsView, ipcMain, session, safeStorage, shell } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs');
const { snapshot, interact, normalizeURL, describeTarget } = require('./browser.cjs');
const { runDeepSeek } = require('./agent.cjs');
const {sendMessage}=require('./send-message.cjs');
const {replyPolicy}=require('./chat-policy.cjs');
const {assertMessageTarget}=require('./conversation.cjs');
const {inboxPlan,openInbox}=require('./inbox.cjs');
const { createSettingsStore } = require('./settings.cjs');
const {createChatStore}=require('./chats.cjs');
const {LOCAL_BASE,LOCAL_MODEL,normalizeLocalBase,connection,testConnection}=require('./providers.cjs');
const profile = process.env.NEXO_TEST_PROFILE || path.join(__dirname,'../.nexo-profile');
fs.mkdirSync(profile,{recursive:true});
app.setPath('userData',profile);
app.setPath('sessionData',profile);
let win, browser, active, pending, ready = false, key = '', model = 'deepseek-flash';
let configError = '', configSaving = false;
let provider='deepseek',localModel=LOCAL_MODEL,baseURL=LOCAL_BASE;
const currentConfig=()=>({key,model,provider,localModel,baseURL});
const publicConfig=()=>({hasKey:!!key,model:provider==='ollama'?localModel:model,provider,localModel,deepseekModel:model,baseURL,error:configError});
let conversation = [];
let currentChat,chatTimer,chatSaveError='';
const chatStore=createChatStore(process.env.NEXO_TEST_PROFILE?path.join(profile,'conversas'):path.join(__dirname,'../conversas'));
const settingsStore = createSettingsStore(profile,safeStorage);
const demoURL = pathToFileURL(path.join(__dirname, '../dist/demo.html')).href;
const emit = (type, text, extra = {}) => {
  if(currentChat && ['user','message','partial','action','warning','error'].includes(type)){
    const event={type:type==='partial'?'message':type,text,...extra,time:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'}),at:new Date().toISOString(),pending:type==='partial'};
    const index=event.id?currentChat.events.findIndex(e=>e.id===event.id):-1;
    if(index>=0)currentChat.events[index]={...currentChat.events[index],text,pending:type==='partial'};
    else currentChat.events.push(event);
    if(type==='user' && !currentChat.customTitle && !currentChat.conversation.length)currentChat.title=text.split(/\r?\n/)[0].slice(0,70) || 'Nova conversa';
    scheduleChatSave();
  }
  if(win && !win.isDestroyed())win.webContents.send('nexo:event',{type,text,...extra});
};
function chatState(){return {chat:currentChat,chats:chatStore.list(),directory:chatStore.directory,error:chatSaveError,ready};}
function chatMeta(){if(win && !win.isDestroyed())win.webContents.send('nexo:event',{type:'chat-meta',chats:chatStore.list(),activeId:currentChat?.id,error:chatSaveError});}
function flushChat(){
  clearTimeout(chatTimer);chatTimer=null;if(!currentChat)return true;
  currentChat.conversation=conversation.slice();currentChat.running=!!active;
  try{chatStore.save(currentChat);chatSaveError='';chatMeta();return true;}
  catch{chatSaveError='Não foi possível salvar o chat. Verifique o espaço e a permissão da pasta de conversas.';chatMeta();return false;}
}
function scheduleChatSave(){if(!chatTimer)chatTimer=setTimeout(flushChat,350);}
function assertCanChangeChat(){if(active || configSaving)throw new Error('Pare a execução antes de trocar de chat.');}
function activateChat(chat,notify=true){
  currentChat=chat;conversation=chat.conversation.slice();chatSaveError='';
  if(notify)emit('chat-loaded','',{state:chatState()});
}
function newChat(){
  assertCanChangeChat();if(!flushChat())throw new Error(chatSaveError);
  const url=currentChat?.url || 'demo';
  const chat=chatStore.create({url,mode:provider==='ollama'?'deepseek':currentChat?.mode || 'demo'});
  activateChat(chat);emit('action','Nova conversa iniciada.');flushChat();return chatState();
}
async function restoreChatPage(){
  ready=false;
  try{
    const url=currentChat.url==='demo' || !currentChat.url?demoURL:normalizeURL(currentChat.url);
    if(browser.webContents.getURL()!==url)await browser.webContents.loadURL(url);
    emit('url',url===demoURL?'Demonstração local':url);
  }catch{emit('warning','O chat foi recuperado, mas não foi possível abrir o último endereço. Abra o site manualmente antes de continuar.');}
  finally{ready=true;}
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
function check() { active?.controller.signal.throwIfAborted(); }
function stop() { active?.controller.abort(); pending?.(false); pending = null; }
function approval(text) {
  emit('approval', text);
  return new Promise(resolve => { pending = resolve; }).then(ok => { pending = null; check(); if (!ok) throw new Error('Ação recusada.'); });
}
async function execute(name, args) {
  check();
  if (!['load_more_inbox','read_page','find_elements','navigate','return_to_inbox','fill','click','send_message','scroll','wait'].includes(name)) throw new Error('Ferramenta desconhecida.');
  if (!args || typeof args !== 'object') throw new Error('Argumentos inválidos.');
  if(name==='load_more_inbox'){
    emit('action','Carregando mais conversas na lista...');
    return require('./inbox-pagination.cjs').loadMoreInbox(browser.webContents,{seen:args.seen,check,policy:active?.replyPolicy});
  }
  if(name==='return_to_inbox'){
    const target=active?.inboxPlan?.target;
    if(!target)throw new Error('Não há endereço de listagem confirmado para o site aberto.');
    const page=await openInbox(browser.webContents,target,{policy:active.replyPolicy,check,emit});
    emit('action',`Lista de conversas carregada: ${page.inbox.rowCount} conversa(s).`);return page;
  }
  if(name==='send_message'){
    const result=await sendMessage(browser.webContents,args,execute,check,active?.replyPolicy);
    emit(result.sent?'action':'warning',result.sent?'Envio confirmado pela página.':result.evidence);
    return result;
  }
  if (name === 'read_page') {
    emit('action','Lendo a página atual');
    const page=await snapshot(browser.webContents,{policy:active?.replyPolicy});
    if(active?.replyPolicy?.skipTerms.length){
      const status=page.conversation?.filter?.status;
      emit('action',status==='skip'?'Filtro verificado: termo de exclusão encontrado no histórico individual carregado. Não enviar nesta conversa.':status==='invitation_only'?'Convite já identificado no histórico. Respostas contextuais continuam permitidas; não repetir o convite.':status==='no_match'?'Filtro verificado: termo de exclusão ausente no histórico individual carregado. Os demais critérios ainda precisam ser conferidos.':'Ainda não foi possível isolar o histórico individual para verificar o filtro.');
    }
    return page;
  }
  if(name==='find_elements'){
    if(typeof args.text!=='string' || !args.text.trim() || args.text.length>120)throw new Error('Informe o texto visível ou nome da pessoa, com até 120 caracteres.');
    emit('action',`Procurando elementos: ${args.text.trim()}`);
    const result=await snapshot(browser.webContents,{query:args.text.trim(),policy:active?.replyPolicy});
    emit('action',`Busca retornou ${result.matchedCount ?? result.elements.length} elemento(s).`);return result;
  }
  if (name === 'navigate') {
    if (typeof args.url !== 'string') throw new Error('Endereço inválido.');
    const url = normalizeURL(args.url);
    if (active.review) await approval(`Abrir ${url}`);
    check(); emit('action',`Abrindo ${url}`); await browser.webContents.loadURL(url); return snapshot(browser.webContents,{policy:active?.replyPolicy});
  }
  if (name === 'click' || name === 'fill') {
    const state = await describeTarget(browser.webContents,args);
    await assertMessageTarget(browser.webContents,args,active?.replyPolicy);
    if (name === 'click' && active.review) await approval(`Clicar em “${state.label || state.tag}” em ${browser.webContents.getURL()}`);
    check();await assertMessageTarget(browser.webContents,args,active?.replyPolicy);emit('action', name === 'click' ? `Clicando em “${state.label || state.tag}”` : `Preenchendo “${state.label || state.tag}”`);
    const result = await interact(browser.webContents,name,args);
    await delay(450); check(); return result;
  }
  if (name === 'scroll') {
    if (!['up','down'].includes(args.direction)) throw new Error('Direção inválida.');
    await browser.webContents.executeJavaScript(`window.scrollBy(0, ${args.direction === 'up' ? -600 : 600})`);
  }
  await delay(name === 'wait' ? 1000 : 250); check(); return snapshot(browser.webContents,{policy:active?.replyPolicy});
}
async function runDemo() {
  // A deterministic, explicitly labelled test; never acts on an external site.
  await browser.webContents.loadURL(demoURL); check();
  const act = async (name,label,value) => {
    const state = await execute('read_page',{});
    const element = state.elements.find(e => e.label === label);
    if (!element) throw new Error(`Campo de demonstração não encontrado: ${label}`);
    await execute(name,{id:element.id,token:state.token,...(value !== undefined ? {value} : {})});
  };
  await act('fill','Sua resposta','Olá, Marina! Consultei o pedido #1042: o prazo de entrega informado é de 3 a 5 dias úteis após a confirmação do pagamento. Posso ajudar com mais alguma coisa?');
  await act('click','Enviar resposta');
  await act('click','Cadastro');
  await act('fill','Nome completo','Marina Alves');
  await act('fill','E-mail','marina@example.com');
  await act('fill','Observações','Cliente consultou o prazo do pedido #1042. Atendimento respondido.');
  await act('click','Salvar cadastro');
  const result = await execute('read_page',{});
  if (!result.text.includes('Cadastro salvo') || !result.text.includes('Resposta enviada')) throw new Error('Não foi possível confirmar o resultado.');
  emit('message','Demonstração concluída: resposta enviada à Marina e cadastro salvo. Todos os dados são fictícios.');
}
function handle(name, fn) {
  ipcMain.handle(`nexo:${name}`, async (event,...args) => {
    if (event.sender !== win.webContents || event.senderFrame !== win.webContents.mainFrame) throw new Error('Origem não autorizada.');
    return fn(...args);
  });
}
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
app.on('second-instance',() => {if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
app.whenReady().then(async () => {
  try { ({key,model,provider,localModel,baseURL} = await settingsStore.load()); }
  catch(error) {configError = error.message;}
  currentChat=chatStore.initial({mode:provider==='ollama'?'deepseek':'demo'});conversation=currentChat.conversation.slice();
  if(currentChat.running){
    currentChat.running=false;
    const text='A execução anterior foi interrompida ao fechar o aplicativo. Revise a página antes de continuar; nenhuma ação será retomada automaticamente.';
    currentChat.events.push({type:'warning',text,time:new Date().toLocaleTimeString('pt-BR'),at:new Date().toISOString()});
    conversation.push({role:'assistant',content:text});flushChat();
  }
  win = new BrowserWindow({width:1440,height:980,minWidth:960,minHeight:720,title:'Nexo · Agente de navegador',backgroundColor:'#ffffff',
    webPreferences:{preload:path.join(__dirname,'preload.cjs'),contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.setMenuBarVisibility(false);
  browser = new WebContentsView({webPreferences:{partition:'persist:nexo-browser',contextIsolation:true,nodeIntegration:false,sandbox:true}});
  win.contentView.addChildView(browser);
  browser.setBounds({x:28,y:170,width:850,height:700});
  const browserSession = session.fromPartition('persist:nexo-browser');
  browserSession.setPermissionRequestHandler((_wc,_permission,callback) => callback(false));
  browserSession.setPermissionCheckHandler(() => false);
  browserSession.on('will-download', event => {event.preventDefault();emit('warning','Downloads não estão habilitados neste protótipo.');});
  const protectNavigation = (event, url) => { if (url === demoURL) return; try { normalizeURL(url); if (!/^https?:/i.test(url)) event.preventDefault(); } catch {event.preventDefault();} };
  browser.webContents.on('will-navigate',protectNavigation);
  browser.webContents.on('will-redirect',protectNavigation);
  browser.webContents.setWindowOpenHandler(({url}) => { emit('warning',`O site solicitou outra janela. Abra o endereço pela barra: ${url.slice(0,300)}`); return {action:'deny'}; });
  const publishURL = () => {
    const url=browser.webContents.getURL();
    if(currentChat && (url===demoURL || /^https?:/i.test(url))){currentChat.url=url===demoURL?'demo':url;scheduleChatSave();}
    emit('url',url===demoURL?'Demonstração local':url);
  };
  browser.webContents.on('did-navigate',publishURL);
  browser.webContents.on('did-navigate-in-page',publishURL);
  browser.webContents.on('did-fail-load',(_e,code,description,_url,main) => {if(main && code !== -3) emit('warning',`Falha ao abrir página: ${description}`);});
  win.webContents.setWindowOpenHandler(() => ({action:'deny'}));
  win.webContents.on('will-navigate',event => event.preventDefault());
  handle('bounds', b => {if (!b || !['x','y','width','height'].every(k => Number.isFinite(b[k]))) return; browser.setBounds({x:Math.max(0,Math.round(b.x)),y:Math.max(0,Math.round(b.y)),width:Math.max(0,Math.round(b.width)),height:Math.max(0,Math.round(b.height))});});
  handle('visible',visible => browser.setVisible(!!visible));
  handle('navigate',async url => {if(active) throw new Error('Pare a tarefa antes de navegar manualmente.'); await browser.webContents.loadURL(url === 'demo' ? demoURL : normalizeURL(url));});
  handle('back',() => {if(!active && browser.webContents.navigationHistory.canGoBack()) browser.webContents.navigationHistory.goBack();});
  handle('reload',() => {if(!active) browser.webContents.reload();});
  handle('config', async config => {
    if(active) throw new Error('Pare a tarefa antes de alterar configurações.');
    if(configSaving) throw new Error('Aguarde o salvamento da configuração.');
    if(!config || typeof config.key !== 'string' || config.key.length > 4096 || typeof config.model !== 'string' || config.model.length > 120 ||
      (config.clearKey !== undefined && typeof config.clearKey !== 'boolean')) throw new Error('Configuração inválida.');
    const nextProvider=config.provider ?? provider;
    if(!['deepseek','ollama'].includes(nextProvider)) throw new Error('Provedor inválido.');
    const nextBase=normalizeLocalBase(config.baseURL ?? baseURL);
    const nextKey = nextProvider==='deepseek' ? (config.clearKey ? '' : (config.key.trim() || key)) : key;
    const nextModel = nextProvider==='deepseek' ? (config.model.trim() || 'deepseek-flash') : model;
    const nextLocalModel=nextProvider==='ollama' ? (config.model.trim() || LOCAL_MODEL) : localModel;
    const changed=provider!==nextProvider || model!==nextModel || localModel!==nextLocalModel || baseURL!==nextBase;
    configSaving = true;
    try {
      await settingsStore.save({key:nextKey,model:nextModel,provider:nextProvider,localModel:nextLocalModel,baseURL:nextBase});
      key = nextKey; model = nextModel; configError = '';
      provider=nextProvider;localModel=nextLocalModel;baseURL=nextBase;
      emit('provider',provider==='ollama'?'Ollama local':'DeepSeek');
      if(changed){configSaving=false;try{newChat();}catch(error){emit('warning',error.message);}}
      return publicConfig();
    } catch {throw new Error('Não foi possível salvar a configuração com segurança. A configuração anterior foi mantida.');}
    finally {configSaving = false;}
  });
  handle('get-config',publicConfig);
  handle('get-chat-state',chatState);
  handle('list-chats',()=>({chats:chatStore.list(),activeId:currentChat.id,directory:chatStore.directory}));
  handle('new-chat',newChat);
  handle('open-chat',async id=>{
    assertCanChangeChat();if(!flushChat())throw new Error(chatSaveError);
    const next=chatStore.select(id);emit('chat-loading','Abrindo chat salvo...');activateChat(next,false);await restoreChatPage();emit('chat-loaded','',{state:chatState()});return chatState();
  });
  handle('rename-chat',({id,title})=>{
    if(id!==currentChat.id || typeof title!=='string' || !title.trim() || title.length>100)throw new Error('Informe um nome de até 100 caracteres para o chat atual.');
    currentChat.title=title.trim();currentChat.customTitle=true;if(!flushChat())throw new Error(chatSaveError);return chatState();
  });
  handle('chat-draft',({id,draft,messageDraft='',mode,review})=>{
    if(id!==currentChat.id)return;
    if(typeof draft!=='string' || draft.length>12000 || typeof messageDraft!=='string' || messageDraft.length>12000 || !['demo','deepseek'].includes(mode) || typeof review!=='boolean')throw new Error('Rascunho inválido.');
    currentChat.draft=draft;currentChat.messageDraft=messageDraft;currentChat.mode=mode;currentChat.review=review;scheduleChatSave();
  });
  handle('save-guidance',({id,text})=>{
    assertCanChangeChat();
    if(id!==currentChat.id || typeof text!=='string' || !text.trim() || text.length>5000)throw new Error('Informe orientações de até 5.000 caracteres para o chat atual.');
    const guidance=text.trim();
    if(conversation.at(-1)?.role!=='user' || conversation.at(-1)?.content!==guidance){
      conversation.push({role:'user',content:guidance});emit('user',guidance,{instructionOnly:true});
    }
    currentChat.draft=guidance;
    if(!flushChat())throw new Error(chatSaveError);
    emit('chat-loaded','',{state:chatState()});return chatState();
  });
  handle('open-chats-folder',async()=>{flushChat();const error=await shell.openPath(chatStore.directory);if(error)throw new Error('Não foi possível abrir a pasta dos chats.');});
  handle('test-connection',config=>{
    if(!config || !['deepseek','ollama'].includes(config.provider) || typeof config.model!=='string' || !config.model.trim() || config.model.length>120 || typeof config.key!=='string' || config.key.length>4096) throw new Error('Configuração inválida.');
    return testConnection({provider:config.provider,key:config.provider==='deepseek'?(config.key.trim()||key):'',model:config.provider==='deepseek'?config.model:model,localModel:config.provider==='ollama'?config.model:localModel,baseURL:normalizeLocalBase(config.baseURL ?? baseURL)});
  });
  handle('reset-conversation',() => {
    return newChat();
  });
  handle('approve',ok => pending?.(!!ok));
  handle('stop',stop);
  handle('run',({task,mode,review}) => {
    if(!ready) throw new Error('O navegador está carregando. Aguarde um instante.');
    if(configSaving) throw new Error('Aguarde o salvamento da configuração.');
    if(active) throw new Error('Já existe uma tarefa em execução.');
    if(typeof task !== 'string' || !task.trim() || task.length > 12000) throw new Error('Descreva uma tarefa de até 12.000 caracteres.');
    if(!['demo','deepseek'].includes(mode)) throw new Error('Modo inválido.');
    if(mode === 'deepseek' && provider==='deepseek' && !key) throw new Error('Informe sua chave do DeepSeek em Configurações.');
    active = {controller:new AbortController(),review:!!review,replyPolicy:mode==='demo'?{skipTerms:[]}:replyPolicy(task,conversation),inboxPlan:inboxPlan(task,conversation,browser.webContents.getURL())};
    emit('user',mode === 'demo' ? 'Executar demonstração guiada.' : task);
    emit('running','Executando tarefa');
    const signal = active.controller.signal;
    const history = conversation.slice();
    let reply = '',partialReply='';
    if(mode === 'deepseek') conversation.push({role:'user',content:task});
    currentChat.mode=mode;currentChat.review=!!review;
    if(!flushChat()){active=null;emit('idle','Falha ao salvar o chat');throw new Error(chatSaveError);}
    const conversationEmit = (type,text,extra) => {
      if(type === 'partial')partialReply=text;
      if(type === 'message'){reply += `${reply ? '\n\n' : ''}${text}`;partialReply='';}
      if(type==='warning' && extra?.includeInContext)reply+=`\n\n[Resultado verificado pelo aplicativo: ${text}]`;
      emit(type,text,extra);
    };
    (async () => {try {
      if(mode === 'demo') await runDemo();
      else await runDeepSeek({...connection(currentConfig()),task,execute,emit:conversationEmit,signal,history});
    } catch(error) {
      const message = signal.aborted ? 'Tarefa interrompida. Ações já concluídas foram mantidas.' : error.message;
      emit(signal.aborted ? 'warning' : 'error',message);
      reply += `${reply ? '\n\n' : ''}${partialReply ? `Resposta parcial: ${partialReply}\n` : ''}${message}`;
    }
    finally {
      if(mode === 'deepseek') conversation.push({role:'assistant',content:reply || 'Execução encerrada sem resposta final. Verifique o estado atual antes de continuar.'});
      active = null;pending = null;flushChat();emit('idle','Pronto para começar');
    }})();
    return true;
  });
  await win.loadFile(path.join(__dirname,'../dist/index.html'));
  if(configError) emit('warning',configError);
  for(const warning of chatStore.warnings.splice(0))emit('warning',warning);
  await restoreChatPage();
  emit('chat-loaded','',{state:chatState()});
  win.show();
  win.on('close',()=>{stop();flushChat();});
  win.on('closed',() => {stop();if(!browser.webContents.isDestroyed()) browser.webContents.close();});
});
app.on('window-all-closed',() => app.quit());
app.on('before-quit',()=>{stop();flushChat();});
}
