const assert=require('node:assert/strict');
const {runDeepSeek}=require('../electron/agent.cjs');
const {replyPolicy,filterHistory}=require('../electron/chat-policy.cjs');
(async()=>{
  const policy=replyPolicy('Filtro: Pular quem já tem "nosigilo" no histórico.');
  for(const testCase of [{text:'Boa noite, tudo bem?',skip:false},{text:'Já entrei no nosigilo.',skip:true}]){
    const filter=filterHistory([{text:testCase.text}],policy);assert.equal(filter.skip,testCase.skip);
    let sendCalls=0;
    await runDeepSeek({key:'',model:'qwen2.5:3b',provider:'ollama',label:'Ollama',endpoint:testCase.skip?'http://127.0.0.1:1/v1':'http://localhost:11434/v1',signal:AbortSignal.timeout(150000),history:[{role:'user',content:'Filtro: Pular quem já tem "nosigilo" no histórico.'},{role:'assistant',content:'Relatório antigo incorreto: ambos devem ser pulados.'}],task:'Envie uma resposta curta e simpática à saudação da pessoa no chat aberto usando send_message. Responda ao que a pessoa falou, sem inventar informação comercial.',emit:()=>{},execute:async(name,args)=>{
      if(name==='read_page')return {title:'Conversa fictícia',url:'https://example.test/threads/fake',chatView:{kind:'conversation'},conversation:{scope:'individual_loaded',messageCount:1,firstLoadedDirection:'incoming',filter},text:'HISTÓRICO INDIVIDUAL: incoming: '+testCase.text,elements:[{id:0,tag:'textarea',label:'Mensagem',messageControl:true},{id:1,tag:'button',label:'Enviar',messageControl:true}]};
      assert.equal(name,'send_message');assert.equal(testCase.skip,false);assert.ok(args.text.trim());assert.doesNotMatch(args.text,/nosigilo/i);sendCalls++;return {sent:true};
    }});
    assert.equal(sendCalls,testCase.skip?0:1);
  }
  console.log('PASS: Ollama real preparou envio contextual no histórico sem o termo (ferramenta simulada). Histórico com o termo foi pulado pelo aplicativo antes de chamar a IA. Nenhuma mensagem real foi enviada.');
})().catch(error=>{console.error(error);process.exitCode=1;});
