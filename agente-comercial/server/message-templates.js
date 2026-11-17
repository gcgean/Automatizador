import crypto from 'node:crypto';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const placeholders=text=>[...new Set([...String(text||'').matchAll(/\{\{\s*([\w]+)\s*\}\}/g)].map(m=>m[1]))];
export function describeTemplate(raw){
 const fields=[],parts=raw.components||[],body=parts.find(c=>c.type==='BODY'),header=parts.find(c=>c.type==='HEADER'),footer=parts.find(c=>c.type==='FOOTER');let unsupported=null;
 const addText=(text,section)=>{let keys=placeholders(text);if(keys.every(k=>/^\d+$/.test(k)))keys.sort((a,b)=>Number(a)-Number(b));for(const key of keys)fields.push({id:section+':'+key,section,key,type:'text',named:raw.parameter_format==='NAMED'||!/^\d+$/.test(key),label:(section==='header'?'Cabeçalho':'Mensagem')+' · {{'+key+'}}'});};
 if(!body?.text)unsupported='Modelo sem mensagem de texto compatível.';
 if(raw.category==='AUTHENTICATION')unsupported='Modelo de autenticação: não se aplica à retomada de atendimento.';
 if(body)addText(body.text,'body');
 if(header){if(header.format==='TEXT')addText(header.text,'header');else if(['IMAGE','VIDEO','DOCUMENT'].includes(header.format))fields.push({id:'header:media',section:'header',key:'media',type:header.format.toLowerCase(),label:'Link HTTPS '+({IMAGE:'da imagem',VIDEO:'do vídeo',DOCUMENT:'do documento'}[header.format])+' do cabeçalho'});else unsupported='Formato de cabeçalho ainda não compatível com este envio.';}
 for(const c of parts){if(!['HEADER','BODY','FOOTER','BUTTONS','CALL_PERMISSION_REQUEST'].includes(c.type))unsupported='Este modelo exige um componente ainda não compatível com este envio.';if(c.type==='BUTTONS')for(const [index,b] of (c.buttons||[]).entries()){if(b.type==='URL'&&placeholders(b.url).length){if(placeholders(b.url).length!==1||!b.url.endsWith('{{'+placeholders(b.url)[0]+'}}'))unsupported='Formato de link dinâmico ainda não compatível.';else fields.push({id:'button:'+index,section:'button',key:String(index),type:'text',label:'Complemento do link · '+b.text});}else if(!['QUICK_REPLY','URL','PHONE_NUMBER'].includes(b.type))unsupported='Este modelo exige um botão ainda não compatível com este envio.';}}
 return {name:raw.name,language:raw.language,category:raw.category,body:body?.text||'',header:header?.text||'',footer:footer?.text||'',buttons:parts.find(c=>c.type==='BUTTONS')?.buttons?.map(b=>({text:b.text,type:b.type,url:b.url} ))||[],fields,supported:!unsupported,unsupported,fingerprint:crypto.createHash('sha256').update(JSON.stringify({name:raw.name,language:raw.language,category:raw.category,parameterFormat:raw.parameter_format,parts})).digest('hex')};
}
export function fillTemplate(model,values={}){
 if(!model.supported)throw fail(model.unsupported,409);
 if(!values||typeof values!=='object'||Array.isArray(values))throw fail('Confira os campos do modelo.');
 if(Object.keys(values).some(k=>!model.fields.some(f=>f.id===k)))throw fail('O modelo mudou. Confira novamente os campos.',409);
 const clean={},components=[];
 for(const f of model.fields){const value=values[f.id];if(typeof value!=='string'||!value.trim()||value.length>1024||/[\r\n\t]/.test(value))throw fail('Preencha '+f.label+' com um valor válido, sem quebras de linha.');clean[f.id]=value.trim();if(f.type!=='text'){let url;try{url=new URL(clean[f.id]);}catch{}if(!url||url.protocol!=='https:'||url.username||url.password)throw fail('Informe um link HTTPS público válido para o cabeçalho.');}}
 for(const section of ['header','body']){const fields=model.fields.filter(f=>f.section===section);if(fields.length)components.push({type:section,parameters:fields.map(f=>f.type==='text'?{type:'text',...(f.named?{parameter_name:f.key}:{}),text:clean[f.id]}:{type:f.type,[f.type]:{link:clean[f.id]}})});}
 for(const f of model.fields.filter(f=>f.section==='button'))components.push({type:'button',sub_type:'url',index:f.key,parameters:[{type:'text',text:clean[f.id]}]});
 const render=(text,section)=>String(text||'').replace(/\{\{\s*([\w]+)\s*\}\}/g,(match,key)=>clean[section+':'+key]??match);
 const text=[render(model.header,'header'),model.fields.some(f=>f.type!=='text')?'[Cabeçalho com mídia]':'',render(model.body,'body'),model.footer,...model.buttons.map((b,index)=>b.text+(b.type==='URL'?' · '+String(b.url).replace(/\{\{[^}]+\}\}/g,()=>clean['button:'+index]||''):''))].filter(Boolean).join('\n\n');
 return {values:clean,text,payload:{name:model.name,language:{code:model.language},...(components.length?{components}:{})}};
}
export class TemplateCatalog{
 constructor(registry,{fetchImpl=fetch}={}){this.registry=registry;this.fetch=fetchImpl;}
 async list(id){
  const c=await this.registry.configFor(id);if(!/^\d+$/.test(c.wabaId||'')||!c.accessToken)throw fail('Configure a WABA e o acesso aos modelos desta conexão.',409);
  const all=[],seen=new Set();let cursor;
  for(let page=0;page<20;page++){
   const url=new URL('https://graph.facebook.com/'+c.graphVersion+'/'+c.wabaId+'/message_templates');url.searchParams.set('fields','name,status,language,category,parameter_format,components');url.searchParams.set('limit','100');if(cursor)url.searchParams.set('after',cursor);
   let response,data;try{response=await this.fetch(url.toString(),{headers:{Authorization:'Bearer '+c.accessToken},signal:AbortSignal.timeout(20000)});data=await response.json();}catch{throw fail('Não foi possível consultar os modelos da Meta. Tente novamente.',502);}
   if(!response.ok)throw fail('A Meta não liberou a consulta dos modelos desta WABA'+(Number.isInteger(data.error?.code)?' (código '+data.error.code+')':'')+'. Confira as permissões da conexão.',502);
   if(!Array.isArray(data.data))throw fail('A Meta retornou uma lista de modelos incompleta.',502);all.push(...data.data);
   if(!data.paging?.next)break;cursor=data.paging.cursors?.after;if(!cursor||seen.has(cursor)||page===19)throw fail('A lista de modelos ficou incompleta. Tente novamente.',502);seen.add(cursor);
  }
  return all.filter(t=>t.status==='APPROVED').map(describeTemplate).sort((a,b)=>a.name.localeCompare(b.name)||a.language.localeCompare(b.language));
 }
}
