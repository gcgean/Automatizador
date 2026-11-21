import test from 'node:test';
import assert from 'node:assert/strict';
import {extractInstagram} from '../server/instagram.js';
import {SalesAgent} from '../server/agent.js';
const extract=message=>extractInstagram({object:'instagram',entry:[{id:'123456',messaging:[{sender:{id:'987654'},message}]}]},'123456')[0];
test('stories e menções são bloqueados; DM e resposta a mensagem comum continuam',()=>{
 for(const message of [{mid:'a',text:'preço?',reply_to:{story:{id:'story'}}},{mid:'b',attachments:[{type:'story_mention',payload:{url:'https://example.com'}}]},{mid:'c',reply_to:{story:{id:'story'}}}])assert.equal(extract(message).ignoreAutomation,true);
 for(const message of [{mid:'d',text:'Olá'},{mid:'e',text:'Qual preço?',reply_to:{mid:'old'}}])assert.equal(extract(message).ignoreAutomation,undefined);
});
test('story é registrado sem IA, mídia, agenda, envio ou encaminhamento; repetição é ignorada',async()=>{
 const conv={processedIds:[],histories:{}},events=new Map();let stopped=0;
 const fail=()=>assert.fail('Story não pode acionar automação');
 const store={connectionId:'test',listLeads:async()=>({}),getConversation:async()=>conv,recordEvent:async e=>events.set(e.id,e),saveConversation:async()=>{}};
 const agent=new SalesAgent({config:{},store,whatsapp:{markRead:async()=>{},sendText:fail},cadence:{stop:async()=>stopped++},routing:{intercept:fail},agenda:{intercept:fail},media:{receive:fail}});agent.getProvider=fail;
 const m=extract({mid:'story-test',text:'sim',reply_to:{story:{id:'s'}}});
 assert.equal(await agent.handle(m),null);assert.equal(await agent.handle(m),null);
 assert.equal(events.size,1);assert.equal(events.get(m.id).automationIgnoredReason,'instagram_story');assert.equal(stopped,1);
});
