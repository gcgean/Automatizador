const {randomUUID}=require('node:crypto');
const {runInPage,describeTarget}=require('./browser.cjs');

async function sendMessage(contents,args,execute,check=()=>{},policy){
  const {fieldId,buttonId,text}=args || {};
  if(!Number.isInteger(fieldId) || !Number.isInteger(buttonId) || fieldId===buttonId || typeof text!=='string' || !text.trim() || text.length>12000)throw new Error('Informe campo, botão e texto válidos para enviar.');
  await require('./conversation.cjs').assertChatFilter(contents,policy,text);
  await describeTarget(contents,{id:fieldId});await describeTarget(contents,{id:buttonId},{allowDisabled:true});
  const ticket=randomUUID();
  // Pin actual DOM references before filling. After the fresh snapshot, resolve
  // the very same controls; never guess a new send button after a page change.
  await runInPage(contents,`
    const s=window.__nexoSnapshot,field=s.elements[${fieldId}],button=s.elements[${buttonId}];
    if(/\\/threads(?:\\/|$)/.test(location.pathname) && field.tagName!=='TEXTAREA' && !field.isContentEditable && !/mensagem|message|resposta|reply/i.test(s.labels[${fieldId}]))throw new Error('Abra a conversa individual antes de enviar. Este campo não foi identificado como editor de mensagem.');
    if(!(field instanceof HTMLInputElement || field instanceof HTMLTextAreaElement || field.isContentEditable) || ['password','file','checkbox','radio','button','submit','search'].includes(field.type))throw new Error('O campo indicado não aceita mensagens.');
    if(!button.matches('button,[role="button"],input[type="submit"],input[type="button"]'))throw new Error('O controle de envio precisa ser um botão.');
    const text=${JSON.stringify(text)};
    const count=value=>value.split(text).length-1;
    window.__nexoSend={ticket:${JSON.stringify(ticket)},field,button,url:location.href,label:s.labels[${buttonId}],before:count(document.body.innerText),text};
  `);
  check();await execute('fill',{id:fieldId,value:text});
  check();await execute('read_page',{});
  const target=await runInPage(contents,`
    const t=window.__nexoSend,s=window.__nexoSnapshot;
    if(!t || t.ticket!==${JSON.stringify(ticket)} || location.href!==t.url || !t.field.isConnected || !t.button.isConnected)throw new Error('A conversa ou seus controles mudaram. Nenhum envio foi feito.');
    const value=t.field.isContentEditable?t.field.textContent:t.field.value;
    if(value!==t.text)throw new Error('O texto no campo não corresponde à mensagem. Nenhum envio foi feito.');
    const id=s.elements.indexOf(t.button);
    if(id<0 || s.labels[id]!==t.label || t.button.disabled || !t.button.getClientRects().length)throw new Error('O botão mudou ou não está disponível. Nenhum envio foi feito.');
    return {id};
  `);
  check();await execute('click',target);
  check();await execute('read_page',{});
  let confirmed=false;
  for(let attempt=0;attempt<13;attempt++){
  check();
  confirmed=await runInPage(contents,`
    const t=window.__nexoSend;
    if(!t || t.ticket!==${JSON.stringify(ticket)})return false;
    const value=t.field.isContentEditable?t.field.textContent:t.field.value;
    return location.href===t.url && t.field.isConnected && !value.trim() && document.body.innerText.split(t.text).length-1>t.before;
  `);
  check();
  if(confirmed)break;
  if(attempt<12)await new Promise(resolve=>setTimeout(resolve,250));
  }
  return confirmed?{sent:true,evidence:'O campo foi limpo e uma nova ocorrência da mensagem apareceu na página. Não envie novamente.'}:{sent:false,uncertain:true,evidence:'O clique foi executado uma vez, mas não confirmei a mensagem na página. Não repita o envio; confira manualmente.'};
}
module.exports={sendMessage};
