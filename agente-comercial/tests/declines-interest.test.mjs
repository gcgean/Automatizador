import test from 'node:test';import assert from 'node:assert/strict';
import {declinesInterest} from '../server/consent.js';
test('recusa clara de interesse finaliza; respostas comuns não',()=>{
 for(const text of ['Não tenho interesse','nao tenho mais interesse, obrigado','Sem interesse.','Perdi o interesse','Não estou interessada','não estamos mais interessados','Não quero mais','Não preciso mais, obrigado','Não me procure mais','Pare de me mandar mensagens','sair','Desinteressado'])assert.equal(declinesInterest(text),true,text);
 for(const text of ['Não','não, ainda não uso sistema','Agora não, pode ser amanhã?','Não tenho interesse?','Tenho interesse sim','Não sei se tenho interesse no plano completo, quanto custa?','Não tenho nota fiscal ainda','Quero mais informações','',null])assert.equal(declinesInterest(text??''),false,String(text));
});
