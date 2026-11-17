import React,{useEffect,useRef,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import {connectionColor} from '../shared/connections.js';
import './connections.css';

export function ConnectionBadge({connection}){
 if(!connection)return null;
 return <span className="connection-badge" style={{'--connection-color':connectionColor(connection)}} title={connection.name+(connection.displayPhone?' · '+connection.displayPhone:'')}><i aria-hidden="true"/>{connection.name}</span>;
}
export function ConnectionFilter({connections,selected,onChange,disabled}){
 const [open,setOpen]=useState(false),root=useRef(null);
 useEffect(()=>{if(!open)return;const click=e=>{if(!root.current?.contains(e.target))setOpen(false);},key=e=>{if(e.key==='Escape'){setOpen(false);root.current?.querySelector('button')?.focus();}};document.addEventListener('pointerdown',click);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',click);document.removeEventListener('keydown',key);};},[open]);
 const items=connections.filter(c=>selected.includes(c.id)),label=items.length===1?items[0].name:items.length===connections.length?'Todos os números':items.length+' números';
 return <div className="multi-connection-filter" ref={root}><button type="button" className="secondary connection-filter-trigger" aria-label="Filtrar números WhatsApp" aria-expanded={open} aria-controls="connection-options" disabled={disabled||!connections.length} onClick={()=>setOpen(!open)}><span className="connection-filter-dots" aria-hidden="true">{items.slice(0,3).map(c=><i key={c.id} style={{background:connectionColor(c)}}/>)}</span><span>{label}</span><ChevronDown size={14}/></button>{open&&<div className="connection-options" id="connection-options" role="group" aria-label="Números visíveis nas conversas"><div className="connection-options-heading">Mostrar conversas de</div><button type="button" className="secondary" onClick={()=>onChange(connections.map(c=>c.id))}>Selecionar todos</button>{connections.map(c=><label key={c.id}><input type="checkbox" checked={selected.includes(c.id)} disabled={selected.length===1&&selected.includes(c.id)} onChange={e=>onChange(e.target.checked?[...selected,c.id]:selected.filter(id=>id!==c.id))}/><i style={{background:connectionColor(c)}} aria-hidden="true"/><span><strong>{c.name}</strong><small>{c.displayPhone||'Número sem identificação'}{c.enabled?'':' · pausada'}</small></span></label>)}<small>Selecione um ou mais números.</small></div>}</div>;
}
