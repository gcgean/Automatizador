const { randomUUID } = require('node:crypto');
const labelSource=`const labelOf=e=>{
  const labelled=(e.getAttribute('aria-labelledby') || '').split(/\\s+/).filter(Boolean).map(id=>document.getElementById(id)?.innerText || '').join(' ');
  return String(e.labels?.[0]?.innerText || e.getAttribute('aria-label') || labelled || e.innerText || e.getAttribute('title') || e.getAttribute('alt') || e.querySelector('img[alt]')?.getAttribute('alt') || e.placeholder || e.name || '').replace(/\\s+/g,' ').trim();
};`;

class BrowserActionError extends Error {
  constructor(message,code,recoverable=false){super(message);this.code=code;this.recoverable=recoverable;}
}
async function runInPage(contents,source) {
  let result;
  try {
    // Electron can replace exceptions crossing this boundary with a generic error.
    // Return an envelope instead, keeping the reason and whether any action ran.
    result=await contents.executeJavaScript(`(() => {try {return {ok:true,value:(() => {${source}})()};} catch(error) {return {ok:false,error:String(error.message),code:error.code || 'ACTION_FAILED',recoverable:!!error.recoverable};}})()`);
  } catch {
    throw new BrowserActionError('A página mudou ou interrompeu a execução. O resultado da ação não foi confirmado; leia a página antes de continuar.','EXECUTION_INTERRUPTED');
  }
  if(!result?.ok)throw new BrowserActionError(result?.error || 'Não foi possível executar a ação.',result?.code || 'ACTION_FAILED',result?.recoverable);
  return result.value;
}
function validateTarget(args) {
  const id=typeof args?.id==='string' && /^\d+$/.test(args.id)?Number(args.id):args?.id;
  if(!Number.isInteger(id) || id<0 || id>=180)throw new BrowserActionError('Elemento inválido. Use um id da leitura atual da página.','INVALID_ELEMENT',true);
  if(args.token!==undefined && (typeof args.token!=='string' || args.token.length>100))throw new BrowserActionError('Referência de página inválida. Releia a página.','INVALID_REFERENCE',true);
  return {...args,id};
}
function targetSource(args,{allowDisabled=false}={}) {
  return `${labelSource}const fail=(message,code,recoverable=true)=>{const error=new Error(message);error.code=code;error.recoverable=recoverable;throw error;};
    const s=window.__nexoSnapshot;
    if(!s)fail('A página mudou desde a última leitura. Leia a página novamente.','STALE_PAGE');
    if(${JSON.stringify(args.token!==undefined)} && s.token!==${JSON.stringify(args.token ?? null)})fail('A referência da página expirou. Leia a página novamente para obter os elementos atuais.','STALE_REFERENCE');
    const e=s.elements[${args.id}];
    if(!e || !e.isConnected)fail('O elemento não existe mais na página. Faça uma nova leitura.','ELEMENT_CHANGED');
    if(s.labels && s.labels[${args.id}]!==labelOf(e))fail('O conteúdo deste elemento mudou. Faça uma nova leitura para evitar clicar na conversa errada.','ELEMENT_CHANGED');
    if(!e.getClientRects().length || getComputedStyle(e).visibility==='hidden')fail('O elemento está oculto. Leia os elementos visíveis da página novamente.','ELEMENT_HIDDEN');
    if(${!allowDisabled} && e.disabled)fail('O elemento está desabilitado neste momento.','ELEMENT_DISABLED');
    if(e.type==='password')fail('Digite senhas manualmente no navegador.','PROTECTED_FIELD',false);`;
}
async function describeTarget(contents,args,options={}) {
  args=validateTarget(args);
  return runInPage(contents,`${targetSource(args,options)}return {tag:e.tagName,label:labelOf(e).slice(0,200)};`);
}

function normalizeURL(value) {
  if (typeof value !== 'string' || !value.trim()) throw new Error('Informe um endereço.');
  value = value.trim();
  if (/^[a-z][a-z\d+.-]*:/i.test(value) && !/^https?:\/\//i.test(value) && !/^[\w.-]+:\d+(\/|$)/.test(value)) throw new Error('Use somente HTTP ou HTTPS.');
  const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Use um endereço HTTP ou HTTPS sem credenciais.');
  return url.href;
}

async function snapshot(contents,{query='',policy}={}) {
  const token = randomUUID();
  const data = await runInPage(contents,`
    ${labelSource}
    const visible=e=>e.getClientRects().length && getComputedStyle(e).visibility!=='hidden' && getComputedStyle(e).opacity!=='0' && !e.closest('[aria-hidden="true"],[inert]');
    const semantic='a,button,input,textarea,select,summary,[role="button"],[role="link"],[role="tab"],[role="menuitem"],[role="option"],[role="checkbox"],[role="switch"],[role="treeitem"],[tabindex]:not([tabindex="-1"]),[contenteditable="true"],[onclick]';
    const records=[];
    const scopedEditor=[...document.querySelectorAll('textarea,[contenteditable="true"]')].find(e=>visible(e) && e.closest('.page-container')?.querySelector('main .msg-list'));
    const scopedForm=scopedEditor?.closest('form');
    for(const e of [...document.querySelectorAll('*')].slice(0,15000)){
      const standard=e.matches(semantic);
      if(!standard && !['DIV','SPAN','LI','ARTICLE','TD','IMG'].includes(e.tagName))continue;
      if(!visible(e))continue;
      const label=labelOf(e),ownHandler=typeof e.onclick==='function';
      const custom=!standard && (ownHandler || getComputedStyle(e).cursor==='pointer');
      if(!standard && (!custom || !label || label.length>400 || e.querySelectorAll('a,button,input,textarea,select').length>1))continue;
      const rect=e.getBoundingClientRect();
      const inViewport=rect.bottom>0 && rect.right>0 && rect.top<innerHeight && rect.left<innerWidth;
      const messageControl=e===scopedEditor || !!scopedForm && e.closest('form')===scopedForm;
      const score=(messageControl?2500:0)+(inViewport?1000:0)+(['INPUT','TEXTAREA','SELECT'].includes(e.tagName)?100:0)+(ownHandler?70:0)+(e.hasAttribute('role')?60:0)+(custom && e.children.length?50:0)+(e.tagName==='BUTTON'?40:0)+(label?5:0);
      records.push({e,label,score,inViewport,kind:custom?'clickable':e.getAttribute('role') || e.tagName.toLowerCase()});
    }
    const normalize=text=>text.normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase();
    const query=${JSON.stringify(query)};
    const matched=query?records.filter(item=>normalize(item.label).includes(normalize(query))):records;
    matched.sort((a,b)=>b.score-a.score);
    const selected=matched.slice(0,180);
    const elements=selected.map(item=>item.e);
    window.__nexoSnapshot = { token: ${JSON.stringify(token)}, elements, labels:selected.map(item=>item.label) };
    const chunks=[];let size=0,visited=0;
    const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
    while(walker.nextNode() && visited++<8000 && size<8000){
      const node=walker.currentNode;const parent=node.parentElement;
      const text=node.textContent.replace(/\\s+/g,' ').trim();
      if(!text || !parent || parent.closest('script,style,noscript') || !visible(parent))continue;
      const range=document.createRange();range.selectNodeContents(node);
      if(![...range.getClientRects()].some(r=>r.bottom>0 && r.right>0 && r.top<innerHeight && r.left<innerWidth))continue;
      chunks.push(text);size+=text.length;
    }
    const bodyText=document.body.innerText;
    ${require('./inbox-root.cjs').primaryInboxSource}
    const badgeCanvas=document.createElement('canvas');badgeCanvas.width=badgeCanvas.height=1;
    const badgeContext=badgeCanvas.getContext('2d',{willReadFrequently:true});
    const redBadge=color=>{
      badgeContext.clearRect(0,0,1,1);badgeContext.fillStyle=color;badgeContext.fillRect(0,0,1,1);
      const [r,g,b,a]=badgeContext.getImageData(0,0,1,1).data;
      return a>0 && r>150 && r>g*1.5 && r>b*1.15;
    };
    const inbox=/^\\/threads\\/?$/.test(location.pathname)?{
      pagination:true,unreadOnly:true,urls:[...primaryInbox.root.querySelectorAll('a.px-page[href]')].filter(row=>[...row.querySelectorAll('*')].some(badge=>{
        const label=badge.textContent.trim();
        if(!/^[1-9][0-9]*[+]?$/.test(label) || !badge.getClientRects().length)return false;
        return redBadge(getComputedStyle(badge).backgroundColor);
      })).map(e=>e.href).filter(href=>{try{const u=new URL(href);return u.origin===location.origin && /^\\/threads\\/[^/]+$/.test(u.pathname) && !/\\/(?:archived|archive)$/.test(u.pathname);}catch{return false;}}),
      rowCount:[...primaryInbox.root.querySelectorAll('a.px-page[href]')].filter(e=>{try{const u=new URL(e.href);return u.origin===location.origin && /^\\/threads\\/[^/]+$/.test(u.pathname) && !/\\/(?:archived|archive)$/.test(u.pathname); }catch{return false;}}).length,
      empty:[...document.querySelectorAll('[data-inbox-empty],main [data-empty-state],main [role="status"]')].some(e=>visible(e) && /nenhuma conversa|não há conversas|sem conversas/i.test(e.innerText))
    }:undefined;
    const visibleText=chunks.join('\\n');
    const composer=scopedEditor || records.find(({e,label,inViewport})=>inViewport && (e.tagName==='TEXTAREA' || e.isContentEditable || e.tagName==='INPUT' && e.type!=='search' && !/pesquis|buscar|search/i.test(label) && /mensagem|message|resposta|reply/i.test(label)))?.e;
    const composerForm=composer?.closest('form');
    const hasComposer=!!composer;
    const chatView=/\\/threads(?:\\/|$)/.test(location.pathname)?{kind:hasComposer?'conversation':'inbox'}:undefined;
    return { title: document.title, url: location.href,
      ...(chatView?{chatView}:{}),
      ...(inbox?{inbox}:{}),
      text:(visibleText ? visibleText+'\\n\\nOutros textos da página:\\n'+bodyText : bodyText).slice(0,16000),
      elementCount:records.length,matchedCount:matched.length,query,
      elements: elements.map((e,id) => ({ id, tag: e.tagName.toLowerCase(), type: e.type || '',
        label:selected[id].label.slice(0,200),kind:selected[id].kind,inViewport:selected[id].inViewport,
        messageControl:e===composer || !!composerForm && e.closest('form')===composerForm,editable:e.isContentEditable,value: e.type === 'password' ? '[oculto]' : String(e.value || '').slice(0,300), disabled: !!e.disabled })) };
  `);
  if(policy?.skipTerms?.length || policy?.incomingFirstRequired || data.chatView?.kind==='conversation'){
    const {readConversation}=require('./conversation.cjs');
    const conversation=await readConversation(contents,policy);
    if(conversation.scope==='individual_loaded'){
      data.chatView={kind:'conversation'};
      const focused=conversation.messages.slice(-12).reverse().map(m=>`${m.direction}: ${m.text}`).join('\n');
      data.text=('HISTÓRICO INDIVIDUAL CARREGADO (mais recentes primeiro; não inclui outros contatos):\n'+focused+'\n\nOUTROS TEXTOS DA PÁGINA:\n'+data.text).slice(0,16000);
    }
    data.conversation={scope:conversation.scope,messageCount:conversation.messages.length,firstLoadedDirection:conversation.messages[0]?.direction || 'unknown',audience:conversation.audience,filter:conversation.filter,coverage:'loaded_dom'};
  }
  return { ...data, token };
}

async function interact(contents, name, args) {
  args=validateTarget(args);
  if(!['click','fill'].includes(name))throw new BrowserActionError('Ação desconhecida.','INVALID_ACTION');
  if (name === 'fill' && (typeof args.value !== 'string' || args.value.length > 12000)) throw new Error('Valor de preenchimento inválido.');
  return runInPage(contents,`${targetSource(args)}
    e.scrollIntoView({block:'center'}); e.focus();
    ${name === 'click' ? "e.click();" : `const value = ${JSON.stringify(args.value)};
      if (e.isContentEditable) { e.textContent = value; }
      else if (e instanceof HTMLSelectElement) { e.value = value; }
      else if (e instanceof HTMLInputElement || e instanceof HTMLTextAreaElement) {
        const proto = e instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
        Object.getOwnPropertyDescriptor(proto, 'value').set.call(e, value);
      } else throw new Error('Este elemento não é um campo editável.');
      e.dispatchEvent(new Event('input', {bubbles:true})); e.dispatchEvent(new Event('change', {bubbles:true}));`}
    return 'Ação executada. Leia a página para confirmar o resultado.';
  `);
}

const definitions = [
  ['return_to_inbox','Volta diretamente à lista de conversas do site atual e verifica se os itens carregaram. Não envia mensagens e não depende de botão de voltar sem rótulo.',{}],
  ['read_page', 'Lê o texto e os ids dos elementos da página atual para ações.', {}],
  ['find_elements', 'Busca elementos por texto ou nome visível. Use se uma conversa ou pessoa não aparecer na leitura resumida. Retorna ids novos.', {text:{type:'string'}}],
  ['navigate', 'Abre um endereço HTTP(S) autorizado pela tarefa.', {url:{type:'string'}}],
  ['fill', 'Preenche um campo usando o id da leitura atual. Não envia o formulário.', {id:{type:'integer'},value:{type:'string'}}],
  ['send_message', 'Envia UMA mensagem autorizada: preenche, relê os mesmos controles, clica uma vez com revisão e verifica. O botão pode começar desabilitado com o campo vazio; só é clicado após preencher e confirmar que ficou habilitado. Prefira para responder em chats.', {fieldId:{type:'integer'},buttonId:{type:'integer'},text:{type:'string'}}],
  ['click', 'Clica usando o id da leitura atual. Pode enviar mensagens ou salvar dados. Não invente ids.', {id:{type:'integer'}}],
  ['scroll', 'Rola a página para ler mais conteúdo.', {direction:{type:'string',enum:['up','down']}}],
  ['wait', 'Espera brevemente por conteúdo dinâmico.', {}],
];
const tools = definitions.map(([name, description, properties]) => ({type:'function',function:{name,description,parameters:{type:'object',properties,required:Object.keys(properties),additionalProperties:false}}}));
module.exports = {normalizeURL, snapshot, interact, describeTarget, runInPage, tools};
