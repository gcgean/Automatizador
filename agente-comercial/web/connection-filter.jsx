import React,{useEffect,useRef,useState} from 'react';
import {ChevronDown} from 'lucide-react';
import {ChannelIcon} from './channel-icon.jsx';
import {connectionColor} from '../shared/connections.js';
import './connections.css';
import {request} from './account.jsx';

export function ConnectionBadge({connection}){
 if(!connection)return null;
 return <span className="connection-badge" style={{'--connection-color':connectionColor(connection)}} title={connection.name+(connection.displayPhone?' · '+connection.displayPhone:'')}><i aria-hidden="true"/><ChannelIcon channel={connection.channel} className="connection-channel-icon"/>{connection.name}</span>;
}
export function ConnectionFilter({connections,selected,onChange,disabled,showCosts=false,onViewCosts}){
 const [open,setOpen]=useState(false),root=useRef(null);
 const [costs,setCosts]=useState(null),[costError,setCostError]=useState(''),[loading,setLoading]=useState(false);
 const costKey=connections.map(c=>c.id).sort().join(',');
 useEffect(()=>{if(!open||!showCosts)return;let alive=true;setCosts(null);setCostError('');setLoading(true);request('/meta-costs?summary=month&connections='+encodeURIComponent(costKey)).then(data=>{if(alive)setCosts(data);}).catch(()=>{if(alive)setCostError('Consumo indisponível. Tente novamente mais tarde.');}).finally(()=>{if(alive)setLoading(false);});return()=>{alive=false;};},[open,showCosts,costKey]);
 useEffect(()=>{if(!open)return;const click=e=>{if(!root.current?.contains(e.target))setOpen(false);},key=e=>{if(e.key==='Escape'){setOpen(false);root.current?.querySelector('button')?.focus();}};document.addEventListener('pointerdown',click);document.addEventListener('keydown',key);return()=>{document.removeEventListener('pointerdown',click);document.removeEventListener('keydown',key);};},[open]);
 const items=connections.filter(c=>selected.includes(c.id)),label=items.length===1?items[0].name:items.length===connections.length?'Todos os números':items.length+' números';
 return <div className="multi-connection-filter" ref={root}><button type="button" className="secondary connection-filter-trigger" aria-label="Filtrar números WhatsApp" aria-expanded={open} aria-controls="connection-options" disabled={disabled||!connections.length} onClick={()=>setOpen(!open)}><span className="connection-filter-dots" aria-hidden="true">{items.slice(0,3).map(c=><i key={c.id} style={{background:connectionColor(c)}}/>)}</span><span>{label}</span><ChevronDown size={14}/></button>{open&&<div className="connection-options" id="connection-options" role="group" aria-label="Números visíveis nas conversas"><div className="connection-options-heading">Mostrar conversas de</div><button type="button" className="secondary" onClick={()=>onChange(connections.map(c=>c.id))}>Selecionar todos</button>{connections.map(c=><label key={c.id}><input type="checkbox" checked={selected.includes(c.id)} disabled={selected.length===1&&selected.includes(c.id)} onChange={e=>onChange(e.target.checked?[...selected,c.id]:selected.filter(id=>id!==c.id))}/><i style={{background:connectionColor(c)}} aria-hidden="true"/><span><strong>{c.name}</strong><small>{c.displayPhone||'Número sem identificação'}{c.enabled?'':' · pausada'}</small></span>{showCosts&&<ConnectionCost channel={c.channel} row={costs?.rows?.find(r=>r.connectionId===c.id)} loading={loading} error={costError}/>}</label>)}<small>Selecione um ou mais números.</small>{showCosts&&<div className="connection-cost-note"><strong>WhatsApp/Meta · mês atual{costs?' ('+costs.from.split('-').reverse().join('/')+' a '+costs.to.split('-').reverse().join('/')+')':''}</strong><small>Mensagens e ligações. Sem IA ou anúncios. Dados da Meta podem demorar a atualizar.</small>{costs?.exchange?.available?<small>Conversão estimada: US$ 1 = R$ {costs.exchange.brlPerUsd.toFixed(4)} · PTAX venda de {costs.exchange.date.split('-').reverse().join('/')}.</small>:<small>Cotação indisponível: a conversão não foi estimada.</small>}<small>Sem impostos ou taxas. Não é a fatura final.</small>{onViewCosts&&<button type="button" className="secondary" onClick={()=>{setOpen(false);onViewCosts();}}>Ver consumo detalhado</button>}{costError&&<small role="status">{costError}</small>}</div>}</div>}</div>;
}

function ConnectionCost({row,loading,error,channel}){
 const money=(value,currency)=>value===null||value===undefined?'Indisponível':new Intl.NumberFormat('pt-BR',{style:'currency',currency,minimumFractionDigits:2,maximumFractionDigits:4}).format(value);
 if(channel&&channel!=='whatsapp')return <span className="connection-month-cost"><small>Não se aplica ao consumo WhatsApp</small></span>;
 if(loading)return <span className="connection-month-cost"><small>Consultando mês…</small></span>;
 if(error||!row||row.status==='unavailable')return <span className="connection-month-cost"><small>Consumo indisponível</small></span>;
 return <span className="connection-month-cost" title={row.error||'Custos do WhatsApp/Meta no mês'}><strong>{row.usdEstimated?'≈ ':''}{money(row.usd,'USD')}</strong><small>{row.brlEstimated?'≈ ':''}{money(row.brl,'BRL')}</small>{row.partial&&<small>Parcial · faltam dados</small>}{row.currency&&!['USD','BRL'].includes(row.currency)&&<small>Original: {money(row.nativeTotal,row.currency)}</small>}</span>;
}
