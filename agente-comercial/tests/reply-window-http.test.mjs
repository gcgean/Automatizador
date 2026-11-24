import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import crypto from 'node:crypto';
import {createApp} from '../server/index.js';
import {loadConfig} from '../server/config.js';

test('botão enviar usa a conexão validada ao retomar fora da janela, sem erro de escopo',async()=>{
 const config={...loadConfig({}),panelOnly:false},phone='5511999900900',calls=[],manual=[],errors=[];
 let open=false,blocked=false;
 const lead={telefone:phone},user={id:crypto.randomUUID(),role:'admin',company_id:'default',name:'Operador sintético',connections:['default','segunda-conexao'],signature_default:false};
 const scoped=id=>({connectionId:id,getLead:async()=>lead,listLeads:async()=>({[phone]:lead}),getEvents:async()=>[{direction:'in',at:new Date(Date.now()-(open?3600000:48*3600000)).toISOString()}],getConnection:async()=>({channel:'whatsapp'}),updateLead:async(_,patch)=>({...lead,...patch}),audit:async()=>{}});
 const store=scoped('default'),inbox={jobs:{},accept:async message=>manual.push(message)},registry={config,list:async()=>[],runtime:async id=>({store:scoped(id),inbox})};
 const auth={handle:async()=>false,user:async()=>user,sameOrigin:()=>true};
 const reengagement={automatic:async(id,p,body,actor)=>{calls.push({id,phone:p,requestId:body.requestId,actor:actor.id});if(blocked)throw Object.assign(Error('Contato com recusa de acompanhamento registrada.'),{status:409});return {queued:true,automaticTemplate:true};}};
 const server=http.createServer(createApp({config,store,inbox,registry,auth,reengagement,log:{error:(...args)=>errors.push(args)}}));
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 try{
  const send=id=>fetch('http://127.0.0.1:'+server.address().port+'/leads/'+phone+'/reply?connection='+id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({text:'Mensagem sintética',requestId:crypto.randomUUID(),sign:false})});
  for(const id of ['default','segunda-conexao']){const r=await send(id);assert.equal(r.status,202);assert.equal((await r.json()).automaticTemplate,true);assert.equal(calls.at(-1).id,id);assert.equal(calls.at(-1).phone,phone);assert.equal(calls.at(-1).actor,user.id);}
  assert.equal(errors.length,0);assert.equal(manual.length,0);
  open=true;const r=await send('segunda-conexao');assert.equal(r.status,202);assert.equal((await r.json()).queued,true);assert.equal(manual.length,1);assert.equal(calls.length,2);
  open=false;blocked=true;const refused=await send('default');assert.equal(refused.status,409);assert.match(await refused.text(),/recusa de acompanhamento/);assert.equal(manual.length,1);
 }finally{await new Promise(resolve=>server.close(resolve));}
});
