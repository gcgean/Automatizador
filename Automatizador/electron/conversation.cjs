const {runInPage}=require('./browser.cjs');
const {filterHistory,isInvitation}=require('./chat-policy.cjs');
function conversationSource(){return `(() => {
  const editor=[...document.querySelectorAll('textarea,[contenteditable="true"]')].find(e=>e.getClientRects().length && getComputedStyle(e).visibility!=='hidden');
  const root=editor?.closest('.page-container');
  const list=root?.querySelector('main .msg-list');
  if(!editor || !root || !list)return {scope:'unknown',messages:[]};
  const messages=[...list.querySelectorAll('.chat')].map(e=>({direction:e.classList.contains('chat-start')?'incoming':e.classList.contains('chat-end')?'outgoing':'unknown',text:e.querySelector('.chat-bubble')?.innerText || ''})).filter(m=>m.text.trim());
  return {scope:messages.length?'individual_loaded':'unknown',messages};
})()`;}
function summarizeConversation(raw,policy){
  const known=raw.scope==='individual_loaded';
  const audience={status:!policy?.incomingFirstRequired?'not_required':known && raw.messages[0]?.direction==='incoming'?'first_loaded_incoming':'unverified'};
  return {...raw,audience,filter:filterHistory(known?raw.messages:undefined,policy)};
}
async function readConversation(contents,policy){return summarizeConversation(await runInPage(contents,`return ${conversationSource()};`),policy);}
async function assertChatFilter(contents,policy,outgoingText){
  if(!policy?.skipTerms?.length && !policy?.incomingFirstRequired)return;
  const context=await readConversation(contents,policy);
  if(context.filter.status==='unknown')throw Object.assign(new Error('Não consegui isolar o histórico individual para verificar o filtro. Nenhum envio foi autorizado.'),{code:'FILTER_CONTEXT_MISSING'});
  if(context.filter.status==='skip')throw Object.assign(new Error('Conversa pulada pelo filtro: termo encontrado no histórico individual carregado ('+context.filter.matchedTerms.join(', ')+').'),{code:'FILTER_EXCLUSION'});
  if(context.filter.status==='invitation_only' && typeof outgoingText==='string' && isInvitation(outgoingText,policy))throw Object.assign(new Error('Convite repetido bloqueado. Esta conversa pode receber uma resposta contextual sem novo convite.'),{code:'FILTER_REPEAT_INVITATION'});
  if(context.audience.status==='unverified')throw Object.assign(new Error('Não confirmei que a outra pessoa escreveu primeiro pelas mensagens carregadas. Nenhum envio foi autorizado.'),{code:'FILTER_AUDIENCE_UNVERIFIED'});
  return context;
}
async function assertMessageTarget(contents,args,policy){
  if(!policy?.skipTerms?.length && !policy?.incomingFirstRequired)return;
  const targetState=await runInPage(contents,`const target=window.__nexoSnapshot?.elements[${JSON.stringify(args.id)}];const editor=[...document.querySelectorAll('textarea,[contenteditable="true"]')].find(e=>e.getClientRects().length);const form=editor?.closest('form');return {isMessageControl:!!editor && (target===editor || !!form && target?.closest('form')===form),value:editor?.isContentEditable?editor.textContent:editor?.value || ''};`);
  if(targetState.isMessageControl)await assertChatFilter(contents,policy,typeof args.value==='string'?args.value:targetState.value);
}
module.exports={conversationSource,summarizeConversation,readConversation,assertChatFilter,assertMessageTarget};
