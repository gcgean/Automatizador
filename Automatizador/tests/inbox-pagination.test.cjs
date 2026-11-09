const {test}=require('node:test');const assert=require('node:assert/strict');const {loadMoreInbox}=require('../electron/inbox-pagination.cjs');
const contents={executeJavaScript:async()=>({ok:true,value:{height:100,top:50,bottom:true,busy:false}})};
test('paginação aguarda lote que chega depois dos antigos seis segundos',async()=>{
 let reads=0;const page=await loadMoreInbox(contents,{pause:async()=>{},read:async()=>({inbox:{rowCount:50,urls:++reads>30?['nova']:[]}})});
 assert.deepEqual(page.inbox.urls,['nova']);assert.equal(page.paginationExhausted,undefined);
});
test('silêncio do carregamento não é declarado fim da lista',async()=>{
 const page=await loadMoreInbox(contents,{pause:async()=>{},read:async()=>({inbox:{rowCount:50,urls:[]}})});
 assert.equal(page.paginationUnconfirmed,true);assert.equal(page.paginationExhausted,undefined);
});
test('indicateur de chargement bloqué ne boucle pas indéfiniment',async()=>{
 let reads=0;const busy={executeJavaScript:async()=>({ok:true,value:{height:100,top:50,bottom:true,busy:true}})};
 const page=await loadMoreInbox(busy,{pause:async()=>{},read:async()=>{reads++;return {inbox:{rowCount:50,urls:[]}};}});
 assert.equal(page.paginationUnconfirmed,true);assert.ok(reads<160);
});
