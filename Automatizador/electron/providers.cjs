const LOCAL_BASE = 'http://localhost:11434/v1';
const LOCAL_MODEL = 'qwen2.5:3b';
function normalizeLocalBase(value = LOCAL_BASE) {
  let url;
  try {url = new URL(value.trim());} catch {throw new Error('Informe uma Base URL válida, como http://localhost:11434/v1.');}
  if (!['http:','https:'].includes(url.protocol) || !['localhost','127.0.0.1','[::1]'].includes(url.hostname) || url.username || url.password || url.search || url.hash || url.pathname.replace(/\/+$/,'') !== '/v1') {
    throw new Error('Ollama local: use localhost, 127.0.0.1 ou [::1], com o caminho /v1 e sem credenciais na URL.');
  }
  return url.href.replace(/\/+$/,'');
}
function connection({provider='deepseek',key='',model='deepseek-flash',baseURL=LOCAL_BASE,localModel=LOCAL_MODEL}) {
  return provider === 'ollama'
    ? {provider,label:'Ollama',model:localModel,key:'',endpoint:`${normalizeLocalBase(baseURL)}/chat/completions`}
    : {provider:'deepseek',label:'DeepSeek',model,key,endpoint:'https://api.deepseek.com/chat/completions'};
}
async function testConnection(config) {
  const info=connection(config);
  if(info.provider === 'deepseek' && !info.key) throw new Error('Informe a chave do DeepSeek para testar.');
  let response;
  try {response=await fetch(info.endpoint.replace(/\/chat\/completions$/,'/models'),{
    headers:info.key ? {Authorization:`Bearer ${info.key}`} : {},signal:AbortSignal.timeout(10000),redirect:'error'
  });}catch{throw new Error(`Não foi possível conectar ao ${info.label}. Confira se o serviço está em execução e o endereço está correto.`);}
  if(!response.ok) throw new Error(`${info.label} retornou HTTP ${response.status} ao consultar os modelos.`);
  const result=await response.json();
  if(!result.data?.some(item=>item.id === info.model)) throw new Error(`O modelo ${info.model} não está disponível nesse provedor. Confira o nome ou instale o modelo no Ollama.`);
  return {ok:true,text:`Conectado ao ${info.label}. Modelo ${info.model} disponível.`};
}
module.exports={LOCAL_BASE,LOCAL_MODEL,normalizeLocalBase,connection,testConnection};
