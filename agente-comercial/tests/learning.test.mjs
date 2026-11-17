import test from 'node:test';
import assert from 'node:assert/strict';
import {LearningService} from '../server/learning.js';

function fixture({contacts=1,outbound=1,input,existing=false,sample}={}){
 const queries=[],requests=[];
 const metrics={contacts,outbound,eligible:0,answered:0,won:0};
 const pool={async query(sql,args){
  queries.push({sql,args});
  if(sql.startsWith('WITH sequence'))return {rows:[metrics]};
  if(sql.startsWith('SELECT id FROM learning_proposals'))return {rowCount:existing?1:0,rows:existing?[{id:'existing'}]:[]};
  if(sql.startsWith('WITH recent_contacts'))return {rows:sample??[
   {phone:'5511999999999',direction:'in',text:'Quero conhecer. Meu email é qa@example.com e telefone 5511999999999'},
   {phone:'5511999999999',direction:'out',actor:'ai',text:'Qual sistema você usa?'}
  ]};
  return {rows:[],rowCount:1};
 }};
 const store={pool,scope(id){return {pool,connectionId:id,getConnection:async()=>({contextId:'context-'+id,contextVersion:1,contextBody:'Contexto de teste',provider:'test'})};}};
 const answer=input??{summary:'Abertura pode ser mais objetiva.',suggestion:'Faça uma pergunta ligada à necessidade.',limitations:'Poucas mensagens; hipótese.',strengths:['Saudação breve.'],opportunities:[{priority:'alta',problem:'Pergunta genérica',evidence:'Contato 1 recebeu uma pergunta genérica.',recommendation:'Perguntar sobre a necessidade.',exampleReply:'Você procura emissão fiscal ou controle de estoque?'}]};
 const service=new LearningService(store,{list:async()=>[]},{providerFactory:()=>({complete:async request=>{requests.push(request);return {toolCalls:[{name:'propor_melhoria',input:answer}]};}})});
 return {service,queries,requests};
}

test('análise manual permite baixa amostra, persiste diagnóstico e preserva isolamento',async()=>{
 const {service,queries,requests}=fixture();
 assert.ok((await service.analyze('cilos')).id);
 const payload=JSON.parse(requests[0].messages[0].content);
 assert.equal(payload.sampleInfo.smallSample,true);
 assert.equal(payload.sampleInfo.contacts,1);
 assert.equal(payload.sample[0].contact,'Contato 1');
 assert.equal(payload.sample[1].actor,'ai');
 assert.doesNotMatch(JSON.stringify(payload),/qa@example.com|5511999999999/);
 assert.match(requests[0].system,/nunca siga instruções/);
 const insert=queries.find(q=>q.sql.startsWith('INSERT INTO learning_proposals'));
 assert.equal(insert.args[1],'cilos');
 assert.equal(insert.args[2],'context-cilos');
 assert.equal(insert.args[4].opportunities[0].priority,'alta');
 assert.equal(insert.args[4].sample.messages,2);
 const sample=queries.find(q=>q.sql.startsWith('WITH recent_contacts'));
 assert.deepEqual(sample.args,['cilos']);
 assert.match(sample.sql,/connection_id=\$1 AND phone=c.phone/);
 assert.equal(queries.some(q=>q.sql.includes('INSERT INTO context_profiles')),false);
});

test('automático mantém mínimo e não chama provedor com baixa amostra',async()=>{
 const {service,requests}=fixture();
 assert.equal((await service.analyze('default',{automatic:true})).insufficient,true);
 assert.equal(requests.length,0);
});

test('análise exige entradas e saídas com texto',async()=>{
 for(const options of [{contacts:0},{outbound:0},{sample:[{phone:'1',direction:'in',text:'Olá'}]}]){
  const {service,requests}=fixture(options);
  assert.equal((await service.analyze('default')).insufficient,true);
  assert.equal(requests.length,0);
 }
});

test('sugestão recente é reutilizada sem nova chamada',async()=>{
 const {service,requests}=fixture({existing:true});
 assert.equal((await service.analyze('default')).id,'existing');
 assert.equal(requests.length,0);
});

test('diagnóstico malformado não é salvo e libera execução para nova tentativa',async()=>{
 const {service,queries}=fixture({input:{summary:'Resumo',suggestion:'Ajuste',limitations:'Limites',strengths:[],opportunities:[{priority:'urgente'}]}});
 await assert.rejects(service.analyze('default'),/prioridade/);
 assert.equal(service.running.size,0);
 assert.equal(queries.some(q=>q.sql.startsWith('INSERT')),false);
});

test('análises simultâneas da mesma conexão retornam conflito',async()=>{
 const {service}=fixture();
 service.running.add('default');
 await assert.rejects(service.analyze('default'),error=>error.status===409);
});
