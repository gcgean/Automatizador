const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const {createChatStore}=require('../electron/chats.cjs');
test('chats separados são salvos, reabertos e exportados em Markdown',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'nexo-chat-unit-'));
  const store=createChatStore(directory);const first=store.initial();
  first.title='Atendimento / Marina';first.conversation=[{role:'user',content:'Olá, Marina'},{role:'assistant',content:'Como posso ajudar?'}];first.events=[{type:'user',text:'Olá, Marina',time:'10:00'},{type:'message',text:'Como posso ajudar?',time:'10:01'}];store.save(first);
  const second=store.create();assert.notEqual(first.id,second.id);
  const reopened=createChatStore(directory);assert.equal(reopened.initial().id,second.id);assert.equal(reopened.list().length,2);
  assert.deepEqual(reopened.select(first.id).conversation,first.conversation);
  assert.match(fs.readFileSync(path.join(directory,`${first.id}.md`),'utf8'),/Como posso ajudar/);
  assert.throws(()=>store.open('../settings'));assert.equal(store.list().length,2);
});
test('arquivo inválido não é sobrescrito e não impede abrir os outros chats',()=>{
  const directory=fs.mkdtempSync(path.join(os.tmpdir(),'nexo-chat-corrupt-'));
  const store=createChatStore(directory);const chat=store.create();
  const invalid='12345678-1234-1234-1234-123456789abc.json';fs.writeFileSync(path.join(directory,invalid),'broken');
  const recovered=createChatStore(directory);assert.equal(recovered.list().length,1);assert.equal(recovered.initial().id,chat.id);assert.equal(recovered.warnings.length,1);assert.equal(fs.readFileSync(path.join(directory,invalid),'utf8'),'broken');
});
