const {test}=require('node:test');
const assert=require('node:assert/strict');
const {parseDecision,buildDecisionSchema}=require('../electron/decision.cjs');
test('schema permite preencher somente campos atuais e exclui elementos desabilitados e senhas',()=>{
  const schema=buildDecisionSchema({elements:[{id:0,tag:'button'},{id:1,tag:'input',type:'text'},{id:2,tag:'input',type:'password'},{id:3,tag:'textarea',disabled:true}]});
  const fill=schema.oneOf.find(b=>b.properties.action.const==='fill');
  assert.deepEqual(fill.properties.arguments.properties.id.enum,[1]);
  assert.throws(()=>parseDecision('{"action":"fill","arguments":{"id":0,"value":"x"}}',schema));
  assert.equal(parseDecision('{"action":"fill","arguments":{"id":1,"value":"x"}}',schema).tool_calls[0].function.name,'fill');
});
const {decisionMessages,decisionInstruction}=require('../electron/model-client.cjs');
test('botão de envio inicialmente desabilitado pode ser preparado por send_message, mas não clicado diretamente',()=>{
  const schema=buildDecisionSchema({elements:[{id:0,tag:'textarea',messageControl:true},{id:1,tag:'button',disabled:true,messageControl:true}]});
  assert.ok(schema.oneOf.some(b=>b.properties.action.const==='send_message'));
  assert.ok(!schema.oneOf.find(b=>b.properties.action.const==='click').properties.arguments.properties.id.enum.includes(1));
});
test('resumo local omite metadados redundantes sem perder senha, botão ARIA ou campo editável',()=>{
  const {pageSummary}=require('../electron/context.cjs');
  const page={text:'Fictício',elements:[{id:7,tag:'button',kind:'button',type:'submit',label:'Enviar'},{id:9,tag:'input',kind:'input',type:'password',label:'Senha'},{id:12,tag:'div',kind:'button',label:'Abrir'},{id:15,tag:'div',kind:'textbox',editable:true,label:'Mensagem'}]};
  const summary=pageSummary(page,true);
  assert.equal(summary.elements[0].kind,undefined);assert.equal(summary.elements[0].type,undefined);
  assert.equal(summary.elements[1].type,'password');assert.equal(summary.elements[2].kind,'button');assert.equal(summary.elements[3].editable,true);
  const schema=buildDecisionSchema(summary);const fill=schema.oneOf.find(b=>b.properties.action.const==='fill');
  assert.deepEqual(fill.properties.arguments.properties.id.enum,[15]);
});
test('instrução compacta preserva ações permitidas sem duplicar o schema e seus ids',()=>{
  const page={elements:Array.from({length:40},(_,id)=>({id,tag:id%2?'button':'input',type:'text'}))};
  const schema=buildDecisionSchema(page,{blockedTools:['read_page','find_elements']});
  const compact=decisionInstruction(schema);
  assert.match(compact,/send_message\(fieldId,buttonId,text\)/);
  assert.ok(!compact.includes('read_page('));assert.ok(!compact.includes('find_elements('));
  assert.ok(compact.length<1000);assert.ok(compact.length<JSON.stringify(schema).length/2);
  assert.ok(!compact.includes('"oneOf"'));assert.ok(!compact.includes('"enum"'));
});
test('envio composto restringe campo e botão aos controles atuais',()=>{
  const page={elements:[{id:0,tag:'button'},{id:1,tag:'input',type:'text'}]};
  const schema=buildDecisionSchema(page,{preferSend:true});
  assert.equal(schema.oneOf.some(b=>b.properties.action.const==='fill'),false);
  assert.equal(parseDecision('{"action":"send_message","arguments":{"fieldId":1,"buttonId":0,"text":"Teste"}}',schema).tool_calls[0].function.name,'send_message');
  assert.throws(()=>parseDecision('{"action":"send_message","arguments":{"fieldId":0,"buttonId":1,"text":"Teste"}}',schema));
  assert.equal(buildDecisionSchema({...page,chatView:{kind:'inbox'}}).oneOf.some(b=>b.properties.action.const==='send_message'),false);
});
test('histórico estruturado preserva a ação e o resultado sem misturar protocolo nativo de ferramentas',()=>{
  const converted=decisionMessages([{role:'assistant',tool_calls:[{function:{name:'fill',arguments:'{"id":1,"value":"Teste"}'}}]},{role:'tool',content:'{"page":{"elements":[{"id":1,"value":"Teste"}]}}'}]);
  assert.deepEqual(JSON.parse(converted[0].content),{action:'fill',arguments:{id:1,value:'Teste'}});
  assert.equal(converted[0].tool_calls,undefined);assert.equal(converted[1].role,'user');
  assert.match(converted[1].content,/RESULTADO REAL.*"value":"Teste"/);
});
test('decisões estruturadas exigem ferramenta e argumentos válidos; prosa nunca vira ação',()=>{
  const result=parseDecision(JSON.stringify({action:'fill',arguments:{id:2,value:'Fictício'}}));
  assert.equal(result.tool_calls[0].function.name,'fill');
  assert.deepEqual(JSON.parse(result.tool_calls[0].function.arguments),{id:2,value:'Fictício'});
  assert.equal(parseDecision('{"action":"done","message":"Falta informação."}').content,'Falta informação.');
  for(const value of ['Vou clicar em Enviar.','null','[]','{"action":"shell","arguments":{}}','{"action":"click","arguments":{"id":"2"}}','{"action":"click","arguments":{"id":2,"code":"x"}}','{"action":"fill","arguments":{"id":2}}'])assert.throws(()=>parseDecision(value));
});
