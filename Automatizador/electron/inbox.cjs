const {snapshot}=require('./browser.cjs');
const canonical=value=>{const u=new URL(value);if(!['http:','https:'].includes(u.protocol) || u.username || u.password || !/^\/threads\/?$/.test(u.pathname))throw new Error('Endereço de listagem inválido.');u.pathname='/threads';u.search='';u.hash='';return u.href;};
function inboxPlan(task='',history=[],currentURL=''){
  const normalize=text=>text.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
  const text=normalize(task);
  const negated=/\b(?:nao|nunca)\s+(?:volte|voltar|retorne|retornar)/.test(text);
  const discussing=/^\s*(?:explique|como|resuma|apenas explique)\b/.test(text);
  const direct=!negated && !discussing && (/^\s*(?:para voltar basta|volte|voltar|volta|retorne|retornar|va para|ir para|abra|abrir)\b/.test(text) || /^\s*https?:\/\/\S+\/threads\/?\s*$/.test(text)) && /\blista(?:gem)?\b|\binbox\b|\/threads(?:\s|[/?#]|$)/.test(text);
  const instructions=history.filter(m=>m.role==='user').map(m=>m.content).concat(task);
  let target;
  for(const instruction of instructions){
    for(const match of instruction.matchAll(/https?:\/\/[^\s<>"')]+/g)){
      try{target=canonical(match[0].replace(/[.,;]+$/,''));}catch{}
    }
  }
  try{
    const current=new URL(currentURL);
    if(target && new URL(target).origin!==current.origin)target=undefined;
    if(!target && /^\/threads(?:\/|$)/.test(current.pathname))target=canonical(current.origin+'/threads');
  }catch{target=undefined;}
  const routine=!negated && !discussing && instructions.some(s=>/\b(?:voltar|volte|retorn[ae]r?|retorne)\b[^\n]{0,100}\b(?:lista|listagem|inbox)\b/i.test(normalize(s)));
  return {target,direct:direct && !!target,thenContinue:/\b(?:proxima|siga|continue|responda|responder|envie|enviar)\b/.test(text),returnAfterSafeFinish:!!target && (routine || direct)};
}
function isInboxReady(page,target){
  try{return canonical(page.url)===canonical(target) && (page.inbox?.rowCount>0 || page.inbox?.empty===true);}catch{return false;}
}
async function loadInboxDocument(contents,url){
  await new Promise((resolve,reject)=>{
    let timer;
    const finish=error=>{clearTimeout(timer);error?reject(error):resolve();};
    timer=setTimeout(()=>finish(new Error('A navegação para a lista demorou demais. Nenhum envio foi executado.')),12000);
    Promise.resolve(contents.loadURL(url)).then(()=>finish(),error=>finish(error));
  });
}
async function openInbox(contents,target,{policy,check=()=>{},emit=()=>{},readPage=()=>snapshot(contents,{policy}),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),maxChecks=12}={}){
  const url=canonical(target);
  check();const before=await readPage();check();
  if(new URL(before.url).origin!==new URL(url).origin)throw new Error('O endereço da lista não pertence ao site aberto.');
  if(!isInboxReady(before,url)){
    if(before.url!==url){emit('action','Voltando para a lista de conversas');await loadInboxDocument(contents,url);check();}
    for(let i=0;i<maxChecks;i++){
      check();const page=await readPage();check();
      try{if(canonical(page.url)!==url)throw new Error();}catch{throw new Error('A navegação não permaneceu na listagem. Verifique o login ou o endereço aberto.');}
      if(isInboxReady(page,url))return page;
      if(i<maxChecks-1)await pause(400);
    }
    throw new Error('A página da lista abriu, mas as conversas não terminaram de carregar. Nenhum envio foi executado.');
  }
  return before;
}
module.exports={inboxPlan,isInboxReady,openInbox};
