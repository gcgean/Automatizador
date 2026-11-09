const {randomUUID}=require('node:crypto');
const {tools}=require('./browser.cjs');
// A stalled model must choose a typed tool call or explicitly stop. Prose is
// never parsed for selectors, message bodies or permission to perform an action.
const decisionSchema={type:'object',oneOf:[
  ...tools.map(({function:tool})=>({type:'object',description:tool.description,properties:{action:{const:tool.name},arguments:tool.parameters},required:['action','arguments'],additionalProperties:false})),
  {type:'object',properties:{action:{const:'done'},message:{type:'string'}},required:['action','message'],additionalProperties:false}
]};
function buildDecisionSchema(page,{preferSend=false,blockedTools=[]}={}){
  const schema={...decisionSchema,oneOf:decisionSchema.oneOf.filter(b=>!blockedTools.includes(b.properties.action.const))};
  if(!Array.isArray(page?.elements))return schema;
  const blockedMessage=['skip','unknown'].includes(page.conversation?.filter?.status) || page.conversation?.audience?.status==='unverified';
  const controls=page.elements.filter(e=>e.type!=='password' && Number.isInteger(e.id) && !(blockedMessage && e.messageControl));
  const available=controls.filter(e=>!e.disabled);
  const ids={fill:available.filter(e=>['input','textarea','select'].includes(e.tag) || e.editable).map(e=>e.id),click:available.map(e=>e.id)};
  const sendButtons=controls.filter(e=>(!e.disabled || e.messageControl) && (e.tag==='button' || e.kind==='button' || (e.tag==='input' && ['submit','button'].includes(e.type)))).map(e=>e.id);
  return {...schema,oneOf:schema.oneOf.filter(branch=>{
    const name=branch.properties.action.const;
    if(name==='send_message')return page.chatView?.kind!=='inbox' && !blockedMessage && ids.fill.length && sendButtons.length;
    if(preferSend && name==='fill' && ids.fill.length && sendButtons.length)return false;
    return !ids[name] || ids[name].length;
  }).map(branch=>{
    if(branch.properties.action.const==='send_message')return {...branch,properties:{...branch.properties,arguments:{...branch.properties.arguments,properties:{...branch.properties.arguments.properties,fieldId:{type:'integer',enum:ids.fill},buttonId:{type:'integer',enum:sendButtons}}}}};
    const allowed=ids[branch.properties.action.const];
    if(!allowed)return branch;
    return {...branch,properties:{...branch.properties,arguments:{...branch.properties.arguments,properties:{...branch.properties.arguments.properties,id:{type:'integer',enum:allowed}}}}};
  })};
}
function parseDecision(content,schema=decisionSchema){
  const invalid=()=>{throw new Error('O modelo não retornou uma decisão válida. Nenhuma ação dessa resposta foi executada.');};
  let value;try{value=JSON.parse(content);}catch{invalid();}
  if(!value || typeof value!=='object' || Array.isArray(value))invalid();
  if(value.action==='done'){
    if(typeof value.message!=='string' || Object.keys(value).some(k=>!['action','message'].includes(k)))invalid();
    return {role:'assistant',content:value.message};
  }
  const tool=tools.find(t=>t.function.name===value.action)?.function;
  if(!tool || Object.keys(value).some(k=>!['action','arguments'].includes(k)))invalid();
  const args=value.arguments;
  if(!args || typeof args!=='object' || Array.isArray(args))invalid();
  const parameters=schema.oneOf.find(branch=>branch.properties.action.const===value.action)?.properties.arguments;
  if(!parameters)invalid();
  if(parameters.required.some(k=>!Object.hasOwn(args,k)) || Object.keys(args).some(k=>!Object.hasOwn(parameters.properties,k)))invalid();
  for(const [key,param] of Object.entries(parameters.properties)){
    if(param.type==='integer'?!Number.isInteger(args[key]):typeof args[key]!==param.type)invalid();
    if(param.enum && !param.enum.includes(args[key]))invalid();
  }
  return {role:'assistant',content:'',tool_calls:[{id:randomUUID(),type:'function',function:{name:tool.name,arguments:JSON.stringify(args)}}]};
}
module.exports={decisionSchema,buildDecisionSchema,parseDecision};
