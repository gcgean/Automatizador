const fs=require('node:fs');
const path=require('node:path');
const {randomUUID}=require('node:crypto');
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function createChatStore(directory) {
  fs.mkdirSync(directory,{recursive:true});
  const entries=new Map();const warnings=[];
  function filename(id){if(typeof id!=='string' || !ID.test(id))throw new Error('Chat inválido.');return path.join(directory,`${id}.json`);}
  function validate(chat){
    if(!chat || chat.version!==1 || !ID.test(chat.id) || typeof chat.title!=='string' || typeof chat.updatedAt!=='string' || !Number.isFinite(Date.parse(chat.updatedAt)) || typeof chat.createdAt!=='string' || !Number.isFinite(Date.parse(chat.createdAt)) || !Array.isArray(chat.events) || !Array.isArray(chat.conversation) || !chat.events.every(e=>e && typeof e.type==='string' && typeof e.text==='string') || !chat.conversation.every(m=>m && ['user','assistant'].includes(m.role) && typeof m.content==='string'))throw new Error('Arquivo de chat inválido.');
    return chat;
  }
  function meta(chat){return {id:chat.id,title:chat.title,updatedAt:chat.updatedAt,createdAt:chat.createdAt,preview:chat.conversation.at(-1)?.content.slice(0,90) || '',url:chat.url || 'demo'};}
  function atomic(file,text){fs.writeFileSync(`${file}.tmp`,text,{mode:0o600});fs.renameSync(`${file}.tmp`,file);}
  function open(id){
    try{const chat=validate(JSON.parse(fs.readFileSync(filename(id),'utf8')));if(chat.id!==id)throw new Error();return chat;}
    catch{throw new Error('Não foi possível abrir este chat. O arquivo original foi preservado.');}
  }
  for(const file of fs.readdirSync(directory)){
    const id=file.endsWith('.json')?file.slice(0,-5):'';
    if(!ID.test(id))continue;
    try{const chat=open(id);entries.set(id,meta(chat));}catch{warnings.push(`Não foi possível ler o chat ${id}. O arquivo foi preservado.`);}
  }
  function save(chat){
    validate(chat);chat.updatedAt=new Date().toISOString();
    atomic(filename(chat.id),JSON.stringify(chat,null,2));entries.set(chat.id,meta(chat));
    try{
      const lines=[`# ${chat.title}`,'',`Criado em: ${chat.createdAt}`,`Atualizado em: ${chat.updatedAt}`,''];
      for(const event of chat.events.filter(e=>['user','message'].includes(e.type)))lines.push(`## ${event.type==='user'?'Você':'Nexo'}${event.pending?' (resposta parcial)':''}`,event.time || '', '',event.text,'');
      atomic(path.join(directory,`${chat.id}.md`),lines.join('\n'));
    }catch{warnings.push('O chat foi salvo em JSON, mas não foi possível atualizar sua cópia em Markdown.');}
    return chat;
  }
  function select(id){if(!entries.has(id))throw new Error('Chat não encontrado.');const chat=open(id);atomic(path.join(directory,'state.json'),JSON.stringify({activeId:id}));return chat;}
  function create(options={}){
    const now=new Date().toISOString();
    const chat={version:1,id:randomUUID(),title:'Nova conversa',customTitle:false,createdAt:now,updatedAt:now,events:[],conversation:[],url:'demo',draft:'',messageDraft:'',mode:'demo',review:true,running:false,...options};
    save(chat);return select(chat.id);
  }
  function list(){return [...entries.values()].sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
  function initial(options={}){
    let activeId;try{activeId=JSON.parse(fs.readFileSync(path.join(directory,'state.json'),'utf8')).activeId;}catch{}
    if(entries.has(activeId))return open(activeId);
    if(entries.size)return select(list()[0].id);
    return create(options);
  }
  return {directory,open,save,select,create,list,initial,warnings};
}
module.exports={createChatStore};
