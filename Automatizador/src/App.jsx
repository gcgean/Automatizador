import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,RotateCw,Settings,Globe,Play,Square,X,Check,ArrowUpRight,Maximize2,Send,FolderOpen,Plus} from 'lucide-react';

function SettingsDialog({onClose,onError}) {
  const [key,setKey]=useState(''); const [model,setModel]=useState('deepseek-flash'); const [hasKey,setHasKey]=useState(false);
  const [saving,setSaving]=useState(false);const [loaded,setLoaded]=useState(false);const [error,setError]=useState('');
  const [provider,setProvider]=useState('deepseek');const [baseURL,setBaseURL]=useState('http://localhost:11434/v1');
  const [models,setModels]=useState({deepseek:'deepseek-flash',ollama:'qwen2.5:3b'});const [testing,setTesting]=useState(false);const [connectionStatus,setConnectionStatus]=useState('');
  useEffect(()=>{window.nexo.getConfig().then(c=>{setModel(c.model);setHasKey(c.hasKey);setProvider(c.provider || 'deepseek');setBaseURL(c.baseURL || 'http://localhost:11434/v1');setModels({deepseek:c.deepseekModel || c.model,ollama:c.localModel || 'qwen2.5:3b'});setError(c.error || '');setLoaded(true);}).catch(e=>setError(e.message));},[]);
  function changeProvider(value){setModels(old=>({...old,[provider]:model}));setProvider(value);setModel(models[value]);setKey('');setConnectionStatus('');setError('');}
  async function test(){setTesting(true);setError('');setConnectionStatus('');try{const result=await window.nexo.testConnection({key,model,provider,baseURL});setConnectionStatus(result.text);}catch(e){setError(e.message);}finally{setTesting(false);}}
  async function persist(clearKey=false) {
    setSaving(true);setError('');
    try {await window.nexo.config({key,model,clearKey,provider,baseURL});onClose();}
    catch(e){setError(e.message);onError(e.message);}
    finally{setSaving(false);}
  }
  function save(event){event.preventDefault();persist();}
  return <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="settings-title"><button className="icon close" aria-label="Fechar configurações" onClick={onClose} disabled={saving || testing}><X size={20}/></button><h2 id="settings-title">Conectar à IA</h2><p>{provider==='ollama'?'Use um modelo instalado no Ollama deste computador. Não precisa de chave de API.':'A chave é salva criptografada neste computador e carregada automaticamente ao abrir o Nexo.'}</p>
    {loaded && provider==='deepseek' && <p className="credential-status" role="status">{hasKey ? 'Chave salva e carregada. Pronta para uso.' : 'Nenhuma chave salva.'}</p>}
    <form onSubmit={save}>
    <label>Provedor de IA<select autoFocus value={provider} onChange={e=>changeProvider(e.target.value)} disabled={!loaded || saving || testing}><option value="deepseek">DeepSeek · API</option><option value="ollama">Ollama · local</option></select></label>
    {provider==='ollama'?<label>Base URL<input value={baseURL} onChange={e=>{setBaseURL(e.target.value);setConnectionStatus('');}} disabled={!loaded || saving || testing} required placeholder="http://localhost:11434/v1"/></label>:<label>Chave da API<input type="password" autoComplete="off" value={key} disabled={!loaded || saving || testing} onChange={e=>setKey(e.target.value)} placeholder={hasKey ? 'Deixe vazio para manter a chave salva' : 'Cole sua chave aqui'}/></label>}
    <label>Modelo<input value={model} onChange={e=>{setModel(e.target.value);setConnectionStatus('');}} required disabled={!loaded || saving || testing}/></label><p className="hint">{provider==='ollama'?'As mensagens e o texto lido dos sites serão processados pelo Ollama no endereço local configurado. A configuração será lembrada ao reabrir.':'Deixe a chave vazia para manter a configuração existente. O texto da página e sua tarefa serão enviados ao DeepSeek durante a execução.'}</p>
    {error && <p className="settings-error" role="alert">{error}</p>}
    {connectionStatus && <p className="credential-status" role="status">{connectionStatus}</p>}
    <button className="secondary" type="button" onClick={test} disabled={!loaded || saving || testing}>{testing?'Testando...':'Testar conexão'}</button>
    <button className="primary" type="submit" disabled={!loaded || saving || testing}>{saving ? 'Salvando...' : 'Salvar configuração'}</button>
    {hasKey && provider==='deepseek' && <button className="secondary" type="button" disabled={saving || testing} onClick={()=>persist(true)}>Remover chave salva</button>}
    </form></section></div>;
}
function BrowserPanel({running,url,setURL,onError,host}) {
  async function open(event) {event.preventDefault();try{await window.nexo.navigate(url === 'Demonstração local' ? 'demo' : url);}catch(e){onError(e.message);}}
  return <section className="browser-panel"><form className="address-bar" onSubmit={open}><button className="icon" type="button" aria-label="Voltar" disabled={running} onClick={()=>window.nexo.back()}><ArrowLeft size={18}/></button><button className="icon" type="button" aria-label="Recarregar" disabled={running} onClick={()=>window.nexo.reload()}><RotateCw size={18}/></button><div className="address-input"><Globe size={15}/><input aria-label="Endereço do site" value={url} disabled={running} onChange={e=>setURL(e.target.value)}/></div><button className="primary" disabled={running}>Abrir</button></form><div className="browser-host" ref={host}/><footer className="browser-footer"><span>Navegador local · sessão de login preservada</span><button disabled={running} onClick={()=>window.nexo.navigate('demo').catch(e=>onError(e.message))}>Abrir demonstração <ArrowUpRight size={13}/></button></footer></section>;
}
function EventList({events,expanded=false}) {
  const list=useRef(null);const following=useRef(true);
  useEffect(()=>{if(following.current && list.current)list.current.scrollTop=list.current.scrollHeight;},[events]);
  return <div ref={list} className={`event-list${expanded?' expanded-events':''}`} role="log" aria-label="Histórico de atividade" aria-live="polite" tabIndex={0} onScroll={()=>{
    const node=list.current;following.current=node.scrollHeight-node.scrollTop-node.clientHeight<40;
  }}>{events.map((event,i)=><div className={`event ${event.type}`} key={i}><span className="event-dot"/><div>{['user','message'].includes(event.type) && <strong className="speaker">{event.type==='user'?'Você':'Nexo'}</strong>}<p>{event.text}</p><time>{event.time}</time></div></div>)}</div>;
}
function ChatComposer({running,onSend,onStop,disabled,message,setMessage}) {
  const [sending,setSending]=useState(false);
  async function submit(event){event.preventDefault();if(!message.trim() || sending || running || disabled)return;setSending(true);try{if(await onSend(message.trim()))setMessage('');}finally{setSending(false);}}
  return <form className="chat-composer" onSubmit={submit}><label>Mensagem para a IA<textarea value={message} onChange={e=>setMessage(e.target.value)} placeholder="Ex.: responda de forma mais curta e pergunte o nome da pessoa." rows={2} maxLength={12000} disabled={sending || disabled}/></label><div className="chat-composer-actions"><span>{running?'Aguarde a resposta ou pare a execução para ajustar.':'IA configurada · mantém o contexto deste chat'}</span>{running?<button className="secondary" type="button" onClick={onStop}><Square size={14}/> Parar</button>:<button className="primary" type="submit" disabled={sending || disabled || !message.trim()}><Send size={15}/> Enviar mensagem</button>}</div></form>;
}
function SavedChats({chats,activeId,onOpen,onRename,onFolder,running}) {
  const active=chats.find(chat=>chat.id===activeId);const [name,setName]=useState(active?.title || '');
  useEffect(()=>{setName(active?.title || '');},[activeId,active?.title]);
  return <aside className="saved-chats"><div className="saved-chats-heading"><h3>Chats salvos</h3><button className="icon" aria-label="Abrir pasta dos chats" onClick={onFolder}><FolderOpen size={18}/></button></div>
    <div className="saved-chat-items" aria-label="Lista de chats salvos">{chats.map(chat=><button key={chat.id} className={`saved-chat-item ${chat.id===activeId?'selected':''}`} aria-pressed={chat.id===activeId} disabled={running} onClick={()=>onOpen(chat.id)}><strong>{chat.title}</strong><span>{chat.preview || 'Conversa sem mensagens'}</span><time>{new Date(chat.updatedAt).toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit'})}</time></button>)}</div>
    <form className="rename-chat" onSubmit={event=>{event.preventDefault();onRename(name);}}><label>Nome do chat<input value={name} onChange={event=>setName(event.target.value)} maxLength={100} required disabled={running}/></label><button className="secondary" disabled={running || !name.trim()}>Salvar nome</button></form>
  </aside>;
}
function ActivityDialog({events,onClose,running,onSend,onStop,onReset,disabled,approval,onApprove,chats,activeId,onOpen,onRename,onFolder,message,setMessage,saveError}) {
  const close=useRef(null);
  useEffect(()=>{const previous=document.activeElement;close.current?.focus();return ()=>previous?.focus();},[]);
  function keyboard(event){
    if(event.key==='Escape'){event.preventDefault();onClose();}
    if(event.key==='Tab'){
      const nodes=[...event.currentTarget.querySelectorAll('button:not(:disabled),input:not(:disabled),textarea:not(:disabled),[tabindex="0"]')];
      const index=nodes.indexOf(document.activeElement);
      if(event.shiftKey && index<=0){event.preventDefault();nodes.at(-1)?.focus();}
      else if(!event.shiftKey && index===nodes.length-1){event.preventDefault();nodes[0]?.focus();}
    }
  }
  return <div className="modal-backdrop"><section className="modal activity-modal" role="dialog" aria-modal="true" aria-labelledby="activity-title" onKeyDown={keyboard}>
    <div className="activity-modal-header"><div><h2 id="activity-title">Atividade completa</h2><p className={saveError?'settings-error':''}>{saveError || `${chats.find(chat=>chat.id===activeId)?.title || 'Converse com a IA'} · salvo automaticamente`}</p></div><div className="conversation-controls"><button className="secondary" onClick={onReset} disabled={running || disabled}>Nova conversa</button><button ref={close} className="secondary" onClick={onClose}><X size={17}/> Fechar</button></div></div>
    <div className="chat-library-layout"><SavedChats chats={chats} activeId={activeId} onOpen={onOpen} onRename={onRename} onFolder={onFolder} running={running}/><div className="chat-conversation">
    <EventList events={events} expanded/>
    {approval && <section className="approval"><strong>Revisar próxima ação</strong><p>{approval}</p><button className="primary" onClick={onApprove}>Permitir</button></section>}
    <ChatComposer running={running} onSend={onSend} onStop={onStop} disabled={disabled} message={message} setMessage={setMessage}/>
    </div></div>
  </section></div>;
}
function Activity({events,onExpand,running,onSend,onStop,disabled,message,setMessage}) {
  return <div className="activity"><div className="activity-heading"><h2>Atividade</h2><button className="secondary expand-activity" onClick={onExpand}><Maximize2 size={15}/> Expandir</button></div><EventList events={events}/><ChatComposer running={running} onSend={onSend} onStop={onStop} disabled={disabled} message={message} setMessage={setMessage}/></div>;
}
export default function App() {
  const [url,setURL]=useState('Demonstração local'); const [running,setRunning]=useState(false); const [settings,setSettings]=useState(false);
  const [activityExpanded,setActivityExpanded]=useState(false);
  const [providerLabel,setProviderLabel]=useState('DeepSeek');
  const [chats,setChats]=useState([]);const [activeChatId,setActiveChatId]=useState('');const [chatLoaded,setChatLoaded]=useState(false);const [chatSaveError,setChatSaveError]=useState('');const [messageDraft,setMessageDraft]=useState('');
  const [mode,setMode]=useState('demo'); const [task,setTask]=useState('Responda à Marina e preencha o cadastro de exemplo.');
  const [review,setReview]=useState(true); const [approval,setApproval]=useState(null); const [status,setStatus]=useState('Pronto para começar');
  const [events,setEvents]=useState([{type:'action',text:'Navegador pronto',time:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})}]);
  const host=useRef(null);const desktop=!!window.nexo;
  function addEvent(type,text,id){setEvents(old=>{
    const item={type,text,...(id?{id}:{}),time:new Date().toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'})};
    const index=id?old.findIndex(event=>event.id===id):-1;
    if(index<0)return [...old,item];
    return old.map((event,i)=>i===index?{...event,type,text}:event);
  });}
  function applyChatState(state){
    setChats(state.chats);setActiveChatId(state.chat.id);setEvents(state.chat.events);setTask(state.chat.draft || '');setMessageDraft(state.chat.messageDraft || '');setMode(state.chat.mode || 'demo');setReview(state.chat.review ?? true);setURL(state.chat.url==='demo'?'Demonstração local':state.chat.url);setChatSaveError(state.error || '');setChatLoaded(!!state.ready);setApproval(null);setRunning(false);setStatus(state.ready?'Pronto para começar':'Carregando o chat...');
  }
  useEffect(()=>{if(!desktop)return;window.nexo.getConfig().then(c=>setProviderLabel(c.provider==='ollama'?'Ollama local':'DeepSeek'));window.nexo.getChatState().then(applyChatState).catch(e=>addEvent('error',e.message));return window.nexo.subscribe(event=>{
    if(event.type==='chat-loaded'){applyChatState(event.state);return;}
    if(event.type==='chat-loading'){setChatLoaded(false);setStatus(event.text);return;}
    if(event.type==='chat-meta'){setChats(event.chats);setActiveChatId(event.activeId);setChatSaveError(event.error || '');return;}
    if(event.type==='provider'){setProviderLabel(event.text);setMode('deepseek');return;}
    if(event.type==='url'){setURL(event.text);return;}
    if(event.type==='reset'){setEvents([{type:'action',text:event.text,time:new Date().toLocaleTimeString('pt-BR')}]);return;}
    if(event.type==='status'){setStatus(event.text);return;}
    if(event.type==='running'){setRunning(true);setStatus(event.text);return;}
    if(event.type==='idle'){setRunning(false);setApproval(null);setStatus(event.text);return;}
    if(event.type==='approval'){setApproval(event.text);setStatus('Aguardando sua revisão');return;}
    addEvent(event.type==='partial'?'message':event.type,event.text,event.id);
  });},[desktop]);
  useEffect(()=>{if(desktop && chatLoaded)window.nexo.saveChatDraft({id:activeChatId,draft:task,messageDraft,mode,review}).catch(e=>addEvent('error',e.message));},[desktop,chatLoaded,activeChatId,task,messageDraft,mode,review]);
  useEffect(()=>{
    if(!desktop || !host.current)return;
    const update=()=>{const b=host.current.getBoundingClientRect();window.nexo.bounds({x:b.x,y:b.y,width:b.width,height:b.height});};
    const observer=new ResizeObserver(update);observer.observe(host.current);window.addEventListener('resize',update);update();
    return ()=>{observer.disconnect();window.removeEventListener('resize',update);};
  },[desktop]);
  useEffect(()=>{if(desktop)window.nexo.visible(!settings && !activityExpanded);},[settings,activityExpanded,desktop]);
  async function run(){try{await window.nexo.run({task:mode==='demo'?'Executar demonstração guiada.':task,mode,review});}catch(e){addEvent('error',e.message);}}
  async function sendChat(message){
    try{await window.nexo.run({task:message,mode:'deepseek',review});setMode('deepseek');return true;}
    catch(e){addEvent('error',e.message);return false;}
  }
  async function resetChat(){try{await window.nexo.resetConversation();}catch(e){addEvent('error',e.message);}}
  async function openChat(id){try{await window.nexo.openChat(id);}catch(e){addEvent('error',e.message);}}
  async function renameChat(title){try{await window.nexo.renameChat({id:activeChatId,title});}catch(e){addEvent('error',e.message);}}
  async function openChatsFolder(){try{await window.nexo.openChatsFolder();}catch(e){addEvent('error',e.message);}}
  async function respond(ok){setApproval(null);await window.nexo.approve(ok);}
  return <><header className="app-header"><div className="brand"><span className="brand-mark">N</span><strong>Nexo</strong><span className="brand-subtitle">Seu agente de navegação</span></div><button className="secondary" onClick={()=>setSettings(true)} disabled={running || !desktop}><Settings size={17}/> Configurações</button></header>
    {!desktop ? <div className="desktop-notice">Este aplicativo usa um navegador nativo. Abra pelo comando <code>npm start</code> para executar o agente.</div> : null}
    <main className="workspace"><BrowserPanel running={running || !desktop} url={url} setURL={setURL} host={host} onError={text=>addEvent('error',text)}/><aside className="agent-panel"><div><h1>O que vamos fazer?</h1><div className="status"><span className={running?'dot busy':'dot'}/>{status}</div></div>
    <section className="chat-picker"><label>Chat salvo<select aria-label="Chat salvo" value={activeChatId} disabled={running || !chatLoaded} onChange={event=>openChat(event.target.value)}>{chats.map(chat=><option key={chat.id} value={chat.id}>{chat.title}</option>)}</select></label><button className="icon" aria-label="Criar novo chat" title="Criar novo chat" onClick={resetChat} disabled={running || !chatLoaded}><Plus size={20}/></button><button className="icon" aria-label="Abrir pasta dos chats" title="Abrir pasta dos chats" onClick={openChatsFolder} disabled={!desktop}><FolderOpen size={18}/></button></section>
    {chatSaveError && <p className="settings-error" role="alert">{chatSaveError}</p>}
    <label>Modo de execução<select value={mode} disabled={running} onChange={e=>setMode(e.target.value)}><option value="demo">Demonstração · sem API</option><option value="deepseek">{providerLabel} · API real</option></select></label>
    <label>Sua tarefa<textarea value={task} disabled={running} onChange={e=>setTask(e.target.value)} rows={5}/></label>
    {mode==='demo' && <p className="hint mode-hint">Teste guiado: envia uma resposta fictícia e salva o cadastro da Marina. O texto acima é usado no modo de IA real.</p>}
    <div className="run-controls"><button className="primary" onClick={run} disabled={running || !desktop || !chatLoaded || (mode!=='demo' && !task.trim())}><Play size={16}/> Executar tarefa</button><button className="secondary" disabled={!running} onClick={()=>window.nexo.stop()}><Square size={14}/> Parar</button></div>
    <label className="checkbox"><input type="checkbox" checked={review} disabled={running} onChange={e=>setReview(e.target.checked)}/> Revisar cliques antes de executar</label>
    {approval && <section className="approval"><strong>Revisar próxima ação</strong><p>{approval}</p><div><button className="primary" onClick={()=>respond(true)}><Check size={15}/> Permitir</button><button className="secondary" onClick={()=>{window.nexo.stop();setApproval(null);}}>Parar tarefa</button></div></section>}
    <Activity events={events} onExpand={()=>setActivityExpanded(true)} running={running} onSend={sendChat} onStop={()=>window.nexo.stop()} disabled={!desktop || !chatLoaded} message={messageDraft} setMessage={setMessageDraft}/><footer className="panel-footer">Chats salvos automaticamente no computador.</footer></aside></main>
    {activityExpanded && <ActivityDialog events={events} onClose={()=>setActivityExpanded(false)} running={running} onSend={sendChat} onStop={()=>window.nexo.stop()} onReset={resetChat} disabled={!desktop || !chatLoaded} approval={approval} onApprove={()=>respond(true)} chats={chats} activeId={activeChatId} onOpen={openChat} onRename={renameChat} onFolder={openChatsFolder} message={messageDraft} setMessage={setMessageDraft} saveError={chatSaveError}/>}
    {settings && <SettingsDialog onClose={()=>setSettings(false)} onError={text=>addEvent('error',text)}/>}
  </>;
}
