function replyPolicy(task='',history=[]){
  const terms=new Set();
  let incomingFirstRequired=false,invitationOnly=false;
  const userTexts=history.filter(m=>m.role==='user').map(m=>m.content).concat(task);
  for(const text of userTexts){
    if(/(?:apenas|somente)\s+quem[^\n]{0,70}escreveu[^\n]{0,30}primeiro/i.test(text))incomingFirstRequired=true;
    if(/(?:remova|remover|desative|desativar)\s+(?:o\s+)?filtro|não precisa pular|nao precisa pular/i.test(text)){terms.clear();continue;}
    for(const line of text.split(/\r?\n/)){
      const invitation=line.match(/(?:filtro|regra)\s+(?:do|de)\s+convite\s*:[^\n"“']{0,160}["“']([^"”'\n]{1,60})["”']/i);
      if(invitation && invitation[1].trim()){terms.add(invitation[1].trim().toLowerCase());invitationOnly=true;continue;}
      if(/(?:não|nao)\s+(?:pular|ignore|ignorar)/i.test(line))continue;
      const match=line.match(/(?:pular|ignorar|excluir)\s+(?:quem|conversas?)[^\n"“']{0,100}["“']([^"”'\n]{1,60})["”']/i);
      if(match && match[1].trim()){terms.add(match[1].trim().toLowerCase());invitationOnly=false;}
    }
  }
  return {skipTerms:[...terms].slice(-4),incomingFirstRequired,invitationOnly};
}
function filterHistory(messages,policy={skipTerms:[]}){
  if(!policy.skipTerms.length)return {status:'not_configured',skip:false,matchedTerms:[]};
  if(!Array.isArray(messages))return {status:'unknown',skip:null,matchedTerms:[]};
  const matchedTerms=policy.skipTerms.filter(term=>messages.some(m=>String(m.text || '').toLocaleLowerCase('pt-BR').includes(term.toLocaleLowerCase('pt-BR'))));
  if(matchedTerms.length && policy.invitationOnly)return {status:'invitation_only',skip:false,blockInvitation:true,matchedTerms};
  return {status:matchedTerms.length?'skip':'no_match',skip:matchedTerms.length>0,matchedTerms};
}
function isInvitation(text,policy){
  const normalized=String(text || '').toLocaleLowerCase('pt-BR').normalize('NFD').replace(/[\u0300-\u036f]/g,'');
  const invitation=/\b(?:te|lhe)\s+convid|\bconvido\b|\b(?:quero|gostaria de|venho)\s+(?:te\s+)?convid|\b(?:venha|vamos|pode)\s+(?:fazer|faca)\s+parte|\bfazer parte da comunidade\b/;
  const branded=policy.skipTerms.some(term=>normalized.includes(term.normalize('NFD').replace(/[\u0300-\u036f]/g,'')));
  return invitation.test(normalized) || branded && /\bgoogle\b|\bdigit|\bpesquis|\bacesse\b|\bcadastr|\bentrar\b/.test(normalized);
}
function plannerText(text){
  return text.replace(/(?:filtro|regra)\s+(?:do|de)\s+convite\s*:[^\n"“']{0,160}["“']([^"”'\n]{1,60})["”']/gi,'[Regra de convite aplicada pelo aplicativo]').replace(/(?:pular|ignorar|excluir)\s+(?:quem|conversas?)[^\n"“']{0,100}["“']([^"”'\n]{1,60})["”']/gi,'[Regra de exclusão aplicada pelo aplicativo]');
}
function plannerView(value){
  if(!value || typeof value!=='object')return value;
  if(Array.isArray(value))return value.map(plannerView);
  return Object.fromEntries(Object.entries(value).map(([key,child])=>{
    if(key==='conversation' && child && typeof child==='object'){
      const {filter,...view}=child;
      if(filter?.status==='invitation_only')view.replyGuidance='Responda normalmente ao contexto desta pessoa, sem repetir o convite que já aparece no histórico.';
      return [key,plannerView(view)];
    }
    return [key,plannerView(child)];
  }));
}
module.exports={replyPolicy,filterHistory,plannerText,plannerView,isInvitation};
