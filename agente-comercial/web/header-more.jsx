import React,{useEffect,useRef,useState} from 'react';
import {ChevronDown} from 'lucide-react';

export function HeaderMore({items,current,onSelect}){
 const [open,setOpen]=useState(false),root=useRef(null),trigger=useRef(null);
 useEffect(()=>{
  if(!open)return;
  const outside=e=>{if(!root.current?.contains(e.target))setOpen(false);};
  const escape=e=>{if(e.key==='Escape'){setOpen(false);trigger.current?.focus();}};
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
  return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
 },[open]);
 return <div className="header-more" ref={root}>
  <button type="button" ref={trigger} className={items.some(([id])=>id===current)?'':'secondary'} aria-expanded={open} aria-controls="header-more-options" onClick={()=>setOpen(value=>!value)}>Mais <ChevronDown size={13}/></button>
  {open&&<div id="header-more-options" className="header-more-options" aria-label="Mais opções de navegação">{items.map(([id,label])=><button type="button" key={id} className={current===id?'':'secondary'} aria-current={current===id?'page':undefined} onClick={()=>{setOpen(false);onSelect(id);}}>{label}</button>)}</div>}
 </div>;
}
