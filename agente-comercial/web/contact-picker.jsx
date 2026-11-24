import React,{useEffect,useRef,useState} from 'react';
import {request} from './account.jsx';
export function ContactPicker({connection,disabled,contact,onSelect}){
 const [query,setQuery]=useState(''),[items,setItems]=useState([]),[open,setOpen]=useState(false),[loading,setLoading]=useState(false),[error,setError]=useState(''),[active,setActive]=useState(-1),input=useRef(null);
 const listId='new-ticket-contact-options';
 useEffect(()=>{setQuery('');setItems([]);setOpen(false);onSelect(null);},[connection]);
 useEffect(()=>{
  let alive=true;setItems([]);setError('');setActive(-1);
  if(!connection||!query.trim()||contact){setLoading(false);return()=>{alive=false;};}
  setLoading(true);
  const timer=setTimeout(async()=>{try{const result=await request('/contacts?'+new URLSearchParams({connection,q:query.trim(),limit:12}));if(alive){setItems(result.items);setActive(result.items.length?0:-1);}}catch(e){if(alive)setError(e.message);}finally{if(alive)setLoading(false);}},250);
  return()=>{alive=false;clearTimeout(timer);};
 },[connection,query,contact]);
 useEffect(()=>{if(open&&active>=0)document.getElementById(listId+'-'+active)?.scrollIntoView({block:'nearest'});},[active,open]);
 function choose(item){onSelect(item);setQuery((item.name||'Contato')+' · '+item.phone);setOpen(false);input.current?.focus();}
 function keyDown(event){
  if(event.key==='Escape'&&open){event.preventDefault();event.stopPropagation();setOpen(false);return;}
  if(['ArrowDown','ArrowUp'].includes(event.key)&&query.trim()&&!contact){event.preventDefault();setOpen(true);if(items.length)setActive(index=>(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length);}
  if(event.key==='Enter'&&open){event.preventDefault();if(items[active])choose(items[active]);}
 }
 const visible=open&&!!query.trim()&&!contact&&!disabled;
 return <div className="new-ticket-contact-picker" onBlur={event=>{if(!event.currentTarget.contains(event.relatedTarget))setOpen(false);}}>
  <label htmlFor="new-ticket-contact-search">Buscar contato</label>
  <input id="new-ticket-contact-search" ref={input} role="combobox" aria-autocomplete="list" aria-expanded={visible} aria-controls={listId} aria-activedescendant={visible&&active>=0?listId+'-'+active:undefined} autoComplete="off" placeholder="Digite o nome ou telefone" value={query} disabled={disabled} onFocus={()=>{if(query.trim()&&!contact)setOpen(true);}} onKeyDown={keyDown} onChange={event=>{setQuery(event.target.value);onSelect(null);setOpen(true);}}/>
  {visible&&<div id={listId} role="listbox" aria-label="Contatos encontrados" aria-busy={loading} className="new-ticket-contact-options">{loading?<p role="status">Buscando contatos…</p>:error?<p role="alert">{error}</p>:items.length?items.map((item,index)=><button key={item.phone} id={listId+'-'+index} type="button" role="option" aria-selected={index===active} tabIndex={-1} onMouseDown={event=>event.preventDefault()} onMouseEnter={()=>setActive(index)} onClick={()=>choose(item)}><strong>{item.name||'Contato'}</strong><span>{item.phone}</span>{item.hasOpenTicket&&<small>Chamado aberto</small>}</button>):<p role="status">Nenhum contato encontrado. Use “Cadastrar novo contato” para incluir esse número.</p>}</div>}
 </div>;
}
