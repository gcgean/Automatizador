const {test}=require('node:test');const assert=require('node:assert/strict');
const {replyPolicy,filterHistory,plannerText,plannerView,isInvitation}=require('../electron/chat-policy.cjs');
test('arquivo de orientações revisadas substitui o filtro antigo sem perder o público-alvo',()=>{
  const fs=require('node:fs'),path=require('node:path');
  const guidance=fs.readFileSync(path.join(__dirname,'../orientacoes-ia.txt'),'utf8');
  assert.ok(guidance.length<=5000);
  const policy=replyPolicy(guidance,[{role:'user',content:'Pular quem já tem "nosigilo" no histórico.'}]);
  assert.equal(policy.invitationOnly,true);assert.equal(policy.incomingFirstRequired,true);assert.deepEqual(policy.skipTerms,['nosigilo']);
});
test('orientação nova limita o filtro ao convite e substitui a exclusão antiga',()=>{
  const previous=[{role:'user',content:'Pular quem já tem "nosigilo" no histórico.'}];
  const policy=replyPolicy('Filtro do convite: não repetir convite quando o histórico contiver "nosigilo". Respostas normais continuam permitidas.',previous);
  assert.equal(policy.invitationOnly,true);
  const result=filterHistory([{text:'Já entrei no nosigilo.'}],policy);
  assert.equal(result.status,'invitation_only');assert.equal(result.skip,false);assert.equal(result.blockInvitation,true);
  assert.equal(isInvitation('Oi, tudo bem? Estou te convidando para fazer parte da comunidade!',policy),true);
  assert.equal(isInvitation('Para entrar pesquise nosigilo. net no Google.',policy),true);
  assert.equal(isInvitation('Por nada! Como você está?',policy),false);
  assert.equal(isInvitation('Posso esclarecer o que sei sobre o nosigilo.',policy),false);
  assert.match(plannerView({conversation:{filter:result}}).conversation.replyGuidance,/Responda normalmente/);
});
test('critério de quem escreveu primeiro usa direção das mensagens carregadas, não um palpite do modelo',()=>{
  const {summarizeConversation}=require('../electron/conversation.cjs');
  const policy=replyPolicy('Público-alvo: Apenas quem já te escreveu primeiro no inbox');
  assert.equal(policy.incomingFirstRequired,true);
  assert.equal(summarizeConversation({scope:'individual_loaded',messages:[{direction:'incoming',text:'Olá'}]},policy).audience.status,'first_loaded_incoming');
  assert.equal(summarizeConversation({scope:'individual_loaded',messages:[{direction:'outgoing',text:'Olá'}]},policy).audience.status,'unverified');
});
test('planejador conserva o pedido e o texto aprovado sem recalcular a regra literal',()=>{
  const text='Responda ao contexto. Pular quem já tem "nosigilo" no histórico.\nModelo aprovado: convite nosigilo. net';
  const result=plannerText(text);
  assert.ok(result.includes('Responda ao contexto.'));assert.ok(result.includes('Modelo aprovado: convite nosigilo. net'));
  assert.ok(!result.includes('Pular quem já tem'));assert.ok(result.includes('aplicada pelo aplicativo'));
});
test('resultado do filtro continua no aplicativo sem contaminar o contexto de composição da IA',()=>{
  const original={text:'Boa noite!',page:{conversation:{scope:'individual_loaded',filter:{status:'skip'},firstLoadedDirection:'incoming'}}};
  const view=plannerView(original);
  assert.equal(view.page.conversation.filter,undefined);assert.equal(original.page.conversation.filter.status,'skip');
  assert.equal(view.text,original.text);assert.equal(view.page.conversation.firstLoadedDirection,'incoming');
});
test('filtro vem das regras do usuário e permanece fora da janela reduzida do modelo',()=>{
  const history=[{role:'user',content:'Filtro obrigatório: Pular quem já tem "nosigilo" no histórico da conversa.'},{role:'assistant',content:'Pular quem tem "outro-termo".'}];
  const policy=replyPolicy('Mas responda de acordo com o contexto.',history);
  assert.deepEqual(policy.skipTerms,['nosigilo']);
  assert.equal(filterHistory([{text:'Oi, vocês são de qual cidade?'}],policy).skip,false);
  assert.equal(filterHistory([{text:'Já entrei no NOSIGILO.'}],policy).skip,true);
  assert.equal(filterHistory(undefined,policy).status,'unknown');
  assert.deepEqual(replyPolicy('Remova o filtro.',history).skipTerms,[]);
});
test('filtro não é invertido por ausência do termo ou texto de instrução fora das mensagens',()=>{
  const policy={skipTerms:['nosigilo']};
  assert.deepEqual(filterHistory([{text:'Boa noite!'}],policy),{status:'no_match',skip:false,matchedTerms:[]});
  assert.equal(filterHistory([{text:'Convite: nosigilo. net'}],policy).status,'skip');
});
