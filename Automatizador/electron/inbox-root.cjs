// Prefer the widest conversation row: compact sidebars must not control pagination.
function primaryInbox(){
 const links=[...document.querySelectorAll('a.px-page[href]')].filter(e=>e.getClientRects().length);
 links.sort((a,b)=>b.getBoundingClientRect().width-a.getBoundingClientRect().width);
 const first=links[0];let box=first?.parentElement;
 while(box && !(box.scrollHeight>box.clientHeight+2 && /auto|scroll/.test(getComputedStyle(box).overflowY)))box=box.parentElement;
 const main=first?.closest('main');
 return {root:main || box || document,box:box || document.scrollingElement};
}
module.exports={primaryInboxSource:'const primaryInbox=('+primaryInbox.toString()+')();'};
