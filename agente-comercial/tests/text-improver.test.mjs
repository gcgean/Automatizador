import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {TextImprover} from '../server/text-improver.js';
import {createApp} from '../server/index.js';
const alice={id:'alice',name:'Alice',role:'operator',connections:['default']},bob={id:'bob',name:'Bob',role:'operator',connections:['default']},viewer={id:'viewer',role:'viewer',connections:['default']};
function fixture(complete=async()=>({text:'Mensagem revisada.'})){let lead={assignedUserId:'alice'},calls=[],audits=[];const scoped={getLead:async()=>lead,getConnection:async()=>({provider:'deepseek'}),audit:async(...a)=>audits.push(a)},store={scope:()=>scoped,audit:scoped.audit};const improver=new TextImprover(store,{providerFactory:name=>({complete:async args=>{calls.push({name,args});return complete(args);}})});return {store,scoped,improver,calls,audits,setLead:value=>{lead=value;}};}
test('revisão usa apenas o rascunho, a IA da conexão e nenhuma ferramenta de envio',async()=>{
 const f=fixture();const result=await f.improver.improve('default','5511999990000',{text:'Texto privado com preço R$ 100 e link https://exemplo.com',mode:'persuasive'},alice);
 assert.equal(result.text,'Mensagem revisada.');assert.equal(f.calls.length,1);assert.equal(f.calls[0].name,'deepseek');assert.deepEqual(f.calls[0].args.tools,[]);assert.equal(f.calls[0].args.messages.length,1);assert.equal(JSON.parse(f.calls[0].args.messages[0].content).rascunho,'Texto privado com preço R$ 100 e link https://exemplo.com');assert.match(f.calls[0].args.system,/Não invente/);assert.match(f.calls[0].args.system,/Preserve nomes, números, valores/);assert.deepEqual(f.audits,[]);
});
test('validação, acesso exclusivo e respostas inválidas preservam o texto sem devolver erros do provedor',async()=>{
 const f=fixture(async()=>{throw Error('provider error with secret fixture');});
 for(const body of [{text:'',mode:'natural'},{text:'x'.repeat(4001),mode:'short'},{text:'oi',mode:'unknown'}])await assert.rejects(f.improver.improve('default','123',body,alice),{status:400});
 await assert.rejects(f.improver.improve('default','123',{text:'oi',mode:'natural'},bob),{status:404});assert.equal(f.calls.length,0);
 await assert.rejects(f.improver.improve('default','123',{text:'oi',mode:'natural'},alice),e=>e.status===502&&!e.message.includes('secret'));
 for(const output of [{text:''},{text:'x'.repeat(4001)},{text:'ok',refused:true},{text:'ok',toolCalls:[{name:'send'}]}]){const g=fixture(async()=>output);await assert.rejects(g.improver.improve('default','123',{text:'oi',mode:'short'},alice),{status:502});}
});
test('uma revisão por usuário por vez, limite de frequência e transferência durante geração',async()=>{
 let release,entered;const ready=new Promise(r=>{entered=r;});const f=fixture(async()=>{entered();return await new Promise(r=>{release=r;});});
 const first=f.improver.improve('default','123',{text:'Oi',mode:'natural'},alice);await ready;
 await assert.rejects(f.improver.improve('other','123',{text:'Oi',mode:'natural'},alice),{status:429});f.setLead({assignedUserId:'bob'});release({text:'Revisão'});await assert.rejects(first,{status:404});assert.equal(f.improver.running.size,0);
 const g=fixture();for(let i=0;i<8;i++)await g.improver.improve('default','123',{text:'Oi',mode:'natural'},alice);await assert.rejects(g.improver.improve('default','123',{text:'Oi',mode:'natural'},alice),{status:429});
});
test('API protege conexão, atendimento, perfil de leitura e revogação durante a solicitação',async()=>{
 const f=fixture();let actor=alice;const users={alice,bob,viewer},auth={handle:async()=>false,sameOrigin:()=>true,user:async req=>req.headers['x-test-user']==='changing'?actor:users[req.headers['x-test-user']]};
 const registry={runtime:async()=>({store:f.scoped,inbox:{jobs:{}}})};const server=http.createServer(createApp({config:{},store:f.store,registry,auth,textImprover:f.improver,log:{error(){}}}));await new Promise(r=>server.listen(0,'127.0.0.1',r));const url='http://127.0.0.1:'+server.address().port;
 const post=(user,query='')=>fetch(url+'/leads/123/improve-text'+query,{method:'POST',headers:{'Content-Type':'application/json','x-test-user':user},body:JSON.stringify({text:'Texto privado',mode:'natural'})});
 try{
  assert.equal((await post('viewer')).status,403);assert.equal((await post('bob')).status,404);assert.equal((await post('alice','?connection=other')).status,403);assert.equal(f.calls.length,0);
  const ok=await post('alice');assert.equal(ok.status,200);assert.equal((await ok.json()).text,'Mensagem revisada.');
  f.improver.providerFactory=()=>({complete:async()=>{actor=viewer;return {text:'Não revelar'};}});assert.equal((await post('changing')).status,403);
  assert.equal(JSON.stringify(f.audits).includes('Texto privado'),false);
 }finally{await new Promise(r=>server.close(r));}
});
