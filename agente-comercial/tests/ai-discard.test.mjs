import test from 'node:test';
import assert from 'node:assert/strict';
import {DISCARD_TOOL,DISCARD_INSTRUCTIONS,AI_DISCARD_REASONS,validateDiscard,discardByAi} from '../server/ai-discard.js';
function fakeStore(lead){
 const queries=[],audits=[],updates=[];
 const tx={pool:{query:async(sql,params)=>{queries.push(sql);return /^SELECT data FROM leads/.test(sql)?{rows:lead?[{data:lead}]:[]}:{rows:[],rowCount:1};}},updateLead:async(phone,patch)=>{updates.push(patch);return {...lead,...patch};},audit:async(...a)=>audits.push(a)};
 return {store:{connectionId:'default',transaction:fn=>fn(tx)},queries,audits,updates};
}
test('ferramenta de descarte: motivos fechados, instrução e regras de quando não descartar',()=>{
 assert.equal(DISCARD_TOOL.name,'descartar_lead');assert.deepEqual(DISCARD_TOOL.input_schema.properties.motivo.enum,AI_DISCARD_REASONS);
 assert.match(DISCARD_INSTRUCTIONS,/afetivas ou românticas/);assert.match(DISCARD_INSTRUCTIONS,/Nunca descarte quem perguntou sobre produtos/);
 const input={motivo:'Fora do perfil',observacao:'Mensagens afetivas sem relação com o sistema.'};
 assert.deepEqual(validateDiscard({status:'em_conversa'},input),{reason:'Fora do perfil',note:'Mensagens afetivas sem relação com o sistema.'});
 assert.equal(validateDiscard({salesQualification:'disqualified'},input),null);
 for(const lead of [{salesQualification:'qualified'},{resultado:'ganho'},{crmDealId:'9'},{status:'encaminhado'},{resultado:'apresentacao_agendada'}])assert.throws(()=>validateDiscard(lead,input));
 assert.throws(()=>validateDiscard({},{motivo:'Sem interesse',observacao:'Disse que não quer.'}),/motivos/);
 assert.throws(()=>validateDiscard({},{motivo:'Fora do perfil',observacao:''}),/observação/);
});
test('descarte grava como a equipe faria, com origem HELENA, e para cadência e conversão',async()=>{
 const f=fakeStore({status:'em_conversa',telefone:'555599988574'});
 const result=await discardByAi(f.store,'555599988574',{motivo:'Fora do perfil',observacao:'Mensagens afetivas sem relação com o sistema.'});
 assert.equal(result.discarded,true);
 assert.equal(f.updates[0].salesQualification,'disqualified');assert.equal(f.updates[0].salesQualificationSource,'ai');assert.equal(f.updates[0].salesQualifiedBy,'HELENA');assert.equal(f.updates[0].resultado,'perdido');assert.equal(f.updates[0].salesQualificationReason,'Fora do perfil');
 assert.ok(f.queries.some(q=>/meta_conversion_events/.test(q)));assert.ok(f.queries.some(q=>/cadence_queue/.test(q)));assert.equal(f.audits[0][0],'sales_qualification_by_ai');
 const again=fakeStore({salesQualification:'disqualified'});assert.deepEqual(await discardByAi(again.store,'1',{motivo:'Fora do perfil',observacao:'Repetido aqui.'}),{already:true});assert.equal(again.updates.length,0);
 const blocked=fakeStore({salesQualification:'qualified'});await assert.rejects(discardByAi(blocked.store,'1',{motivo:'Fora do perfil',observacao:'Qualquer coisa.'}),/qualificado/);assert.equal(blocked.updates.length,0);
});
