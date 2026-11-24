(()=>{
 const root=document.body,buttons=[...document.querySelectorAll('[data-focus]')];let sessionId='';
 try{const key='commercial-page-session:'+location.pathname;sessionId=sessionStorage.getItem(key)||crypto.randomUUID();sessionStorage.setItem(key,sessionId);}catch{}
 const track=(type,action='')=>{
  if(!root.dataset.pageRef||!root.dataset.eventPath||!sessionId)return;
  fetch(root.dataset.eventPath,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({ref:root.dataset.pageRef,sessionId,type,action,focus:root.dataset.selectedFocus}),credentials:'omit',keepalive:true}).catch(()=>{});
 };
 const contacts=title=>document.querySelectorAll('[data-contact-base]').forEach(link=>{const target=new URL(link.dataset.contactBase);target.searchParams.set('text',link.dataset.contactPrefix+' Minha prioridade é '+title.toLowerCase()+'.');link.href=target.href;});
 buttons.forEach(button=>button.addEventListener('click',()=>{
  root.dataset.selectedFocus=button.dataset.focus;
  buttons.forEach(item=>{const selected=item===button;item.setAttribute('aria-pressed',String(selected));item.querySelector('.focus-mark').textContent=selected?'✓':'↗';});
  document.querySelector('[data-preview-title]').textContent=button.dataset.focusTitle;
  document.querySelector('[data-preview-description]').textContent=button.dataset.focusDetail;
  const steps=JSON.parse(button.dataset.focusSteps),container=document.querySelector('[data-preview-steps]');container.replaceChildren();
  steps.forEach((text,index)=>{const row=document.createElement('div');row.className='workflow-row';const number=document.createElement('span');number.className='step-index';number.textContent=String(index+1);const label=document.createElement('span');label.textContent=text;row.append(number,label);container.append(row);});
  contacts(button.dataset.focusTitle);track('focus','segment');
 }));
 document.querySelectorAll('[data-page-action]').forEach(link=>link.addEventListener('click',()=>track('cta',link.dataset.pageAction)));
 document.querySelectorAll('[data-faq]').forEach(item=>item.addEventListener('toggle',()=>{if(item.open)track('faq','faq');}));
 track('view');
})();
