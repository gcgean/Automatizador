const {snapshot,runInPage}=require('./browser.cjs');
const {primaryInboxSource}=require('./inbox-root.cjs');
async function loadMoreInbox(contents,{seen=[],check=()=>{},policy,read=()=>snapshot(contents,{policy}),pause=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const known=new Set(seen);let stable=0,last='',page,stalled=0,progress='';
 while(stable<150 && stalled<150){
  check();page=await read();check();
  if(!page.inbox)throw new Error('A página deixou de ser a lista de conversas.');
  if(page.inbox.urls?.some(url=>!known.has(url)))return page;
  const state=await runInPage(contents,`
    ${primaryInboxSource}
    const box=primaryInbox.box;
    box.scrollTop=box.scrollHeight;
    const end=[...document.querySelectorAll('[data-end-of-list],main p,main [role="status"]')].some(e=>e.getClientRects().length && /^(?:fim da lista|todas as conversas foram carregadas|não há mais conversas|nenhuma outra conversa)[.!]?$/i.test(e.textContent.trim()));
    return {end,height:box.scrollHeight,top:box.scrollTop,bottom:box.scrollTop+box.clientHeight>=box.scrollHeight-3,busy:!!document.querySelector('[aria-busy="true"], [role="progressbar"]')};
  `);
  if(state.end && !state.busy){check();return {...page,paginationExhausted:true};}
  const contentSignature=JSON.stringify([page.inbox.rowCount,page.inbox.urls,state.height]);
  stalled=contentSignature===progress?stalled+1:0;progress=contentSignature;
  const signature=JSON.stringify([page.inbox.rowCount,page.inbox.urls,state.height,state.top]);
  stable=state.bottom && !state.busy && signature===last?stable+1:0;last=signature;
  if(stable>0 && stable%25===0){
    await runInPage(contents,`
      ${primaryInboxSource}
      const box=primaryInbox.box;box.scrollTop=Math.max(0,box.scrollHeight-box.clientHeight-300);
    `);
  }
  await pause(400);
 }
 check();page=await read();check();
 if(page.inbox?.urls?.some(url=>!known.has(url)))return page;
 return {...page,paginationUnconfirmed:true};
}
module.exports={loadMoreInbox};
