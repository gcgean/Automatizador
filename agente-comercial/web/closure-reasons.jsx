import React,{useEffect,useRef,useState} from 'react';
import {createPortal} from 'react-dom';
import {Search,X,Plus,Check,Sparkles} from 'lucide-react';
import {request} from './account.jsx';
import './closure-reasons.css';

const plain=text=>String(text||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();

// Janela aberta ao clicar em Finalizar: pesquisar e adicionar um ou mais motivos,
// e cadastrar um motivo novo depois que a IA confere que ele não repete um existente.
export function ClosurePanel({busy,onCancel,onConfirm,canCreate=true}){
 const [data,setData]=useState(null),[chosen,setChosen]=useState([]),[query,setQuery]=useState(''),[error,setError]=useState(''),[checking,setChecking]=useState(false),[check,setCheck]=useState(null),search=useRef(null);
 useEffect(()=>{let active=true;request('/closure-reasons').then(d=>{if(active)setData(d);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 useEffect(()=>{search.current?.focus();const key=e=>{if(e.key==='Escape')onCancel();};window.addEventListener('keydown',key);return()=>window.removeEventListener('keydown',key);},[]);
 const reasons=data?.reasons||[],picked=chosen.map(id=>reasons.find(r=>r.id===id)).filter(Boolean);
 const term=plain(query),matches=reasons.filter(r=>!chosen.includes(r.id)&&(!term||plain(r.name).includes(term)));
 const exact=term&&reasons.some(r=>plain(r.name)===term);
 const add=id=>{setChosen(c=>c.includes(id)?c:[...c,id]);setQuery('');setCheck(null);search.current?.focus();};
 const remove=id=>setChosen(c=>c.filter(x=>x!==id));
 async function createReason(){
  setChecking(true);setError('');setCheck(null);
  try{const r=await request('/closure-reasons/validated',{name:query});
   if(r.status==='created'){setData(d=>({...d,reasons:[...d.reasons,r.reason].sort((a,b)=>a.name.localeCompare(b.name))}));add(r.reason.id);setCheck({kind:'created',name:r.reason.name,aiChecked:r.aiChecked});}
   else setCheck({kind:'duplicate',reason:r.duplicateOf,how:r.how});}
  catch(e){setError(e.message);}finally{setChecking(false);}
 }
 const missing=!!data?.required&&!chosen.length;
 return createPortal(<div className="closure-modal-backdrop" onMouseDown={e=>{if(e.target===e.currentTarget)onCancel();}}>
  <div className="closure-modal" role="dialog" aria-modal="true" aria-labelledby="closure-modal-title">
   <div className="closure-modal-head"><div><h2 id="closure-modal-title">Finalizar atendimento</h2><p>Informe o motivo do encerramento{data?.required?' (obrigatório)':''}. Você pode adicionar mais de um.</p></div><button type="button" className="icon-button" aria-label="Fechar" onClick={onCancel}><X size={18}/></button></div>
   <div className="closure-chosen" aria-label="Motivos escolhidos">{picked.length?picked.map(r=><span key={r.id} className="closure-chip">{r.name}<button type="button" aria-label={'Remover '+r.name} onClick={()=>remove(r.id)}><X size={12}/></button></span>):<span className="closure-chosen-empty">Nenhum motivo adicionado ainda.</span>}</div>
   <div className="closure-search"><Search size={16}/><input ref={search} aria-label="Pesquisar motivo" placeholder="Pesquisar ou digitar um novo motivo…" value={query} maxLength={60} onChange={e=>{setQuery(e.target.value);setCheck(null);}} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();if(matches.length===1)add(matches[0].id);else if(term&&!exact&&!matches.length)createReason();}}}/></div>
   <div className="closure-results" role="listbox" aria-label="Motivos disponíveis">
    {error?<p role="alert" className="closure-error">{error}</p>:!data?<p className="closure-hint">Carregando motivos…</p>:matches.map(r=><button type="button" role="option" aria-selected="false" key={r.id} onClick={()=>add(r.id)}><Plus size={14}/>{r.name}{r.system&&<small>Automático</small>}</button>)}
    {data&&!matches.length&&!term&&<p className="closure-hint">Todos os motivos já foram adicionados.</p>}{data&&term&&!exact&&!matches.length&&!canCreate&&<p className="closure-hint">Nenhum motivo encontrado. Seu acesso não permite cadastrar motivos novos.</p>}
    {data&&term&&!exact&&canCreate&&<button type="button" className="closure-create" disabled={checking||term.length<3} onClick={createReason}><Sparkles size={14}/>{checking?'Conferindo com a IA…':'Cadastrar novo motivo “'+query.trim()+'”'}</button>}
   </div>
   {check?.kind==='duplicate'&&<div className="closure-check duplicate" role="status">Já existe um motivo com o mesmo sentido: <strong>{check.reason.name}</strong>{check.how==='ia'?' (conferido pela IA)':''}.{check.reason.active!==false?<button type="button" onClick={()=>add(check.reason.id)}>Usar este</button>:<span> Ele está desativado; peça a um administrador para reativar.</span>}</div>}
   {check?.kind==='created'&&<div className="closure-check created" role="status"><Check size={14}/>Motivo <strong>{check.name}</strong> cadastrado{check.aiChecked?' e conferido pela IA':''} e adicionado.</div>}
   <div className="closure-modal-foot"><button type="button" className="secondary" onClick={onCancel}>Cancelar</button><button type="button" disabled={busy||!data||missing} title={missing?'Adicione ao menos um motivo':''} onClick={()=>onConfirm(chosen)}>Finalizar{chosen.length?' com '+chosen.length+' motivo'+(chosen.length>1?'s':''):''}</button></div>
  </div>
 </div>,document.body);
}

// Configurações: cadastro dos motivos e se o motivo é obrigatório.
export function ClosureReasonSettings(){
 const [data,setData]=useState(null),[name,setName]=useState(''),[editing,setEditing]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{request('/closure-reasons?all=1').then(setData).catch(e=>setError(e.message));},[]);
 async function run(fn,message){setBusy(true);setError('');setNotice('');try{setData(await fn());if(message)setNotice(message);return true;}catch(e){setError(e.message);return false;}finally{setBusy(false);}}
 return <section className="closure-settings"><div className="report-heading"><div><h2>Motivos de finalização</h2><p className="muted">Motivos que a equipe escolhe ao finalizar um atendimento. Um atendimento pode ter mais de um motivo. Os motivos marcados como Automático são usados pelo sistema: “Falta de interação” quando o cliente não responde à cadência, “Cliente sem interesse” e “Pediu para não ser contatado” quando a IA finaliza após uma recusa clara do cliente. A HELENA também finaliza conversas concluídas e, se nenhum motivo servir, cria um novo, marcado como Criado pela IA. Renomeie ou desative à vontade.</p></div></div>
  {error&&<p role="alert" className="banner error">{error}</p>}{notice&&<p role="status" className="banner success">{notice}</p>}
  {data&&<>
   <label className="closure-required panel"><input type="checkbox" checked={data.required} disabled={busy} onChange={e=>run(()=>request('/closure-reasons/settings',{required:e.target.checked}),e.target.checked?'Motivo obrigatório ao finalizar.':'Motivo opcional ao finalizar.')}/><span><strong>Exigir motivo ao finalizar</strong><small>Quando ligado, o atendimento só é finalizado depois de escolher ao menos um motivo.</small></span></label>
   <form className="closure-add" onSubmit={async e=>{e.preventDefault();if(!name.trim())return;if(await run(()=>request('/closure-reasons',{name}),'Motivo cadastrado.'))setName('');}}><input aria-label="Novo motivo" placeholder="Novo motivo, ex.: Sem interesse" maxLength={80} value={name} onChange={e=>setName(e.target.value)}/><button disabled={busy||!name.trim()}>Adicionar motivo</button></form>
   <ul className="closure-list">{data.reasons.map(r=><li key={r.id} className={r.active?'':'inactive'}>
    {editing?.id===r.id?<form onSubmit={async e=>{e.preventDefault();if(await run(()=>request('/closure-reasons/'+r.id,{name:editing.name}),'Motivo atualizado.'))setEditing(null);}}><input aria-label="Nome do motivo" maxLength={80} value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})} autoFocus/><button disabled={busy}>Salvar</button><button type="button" className="secondary" onClick={()=>setEditing(null)}>Cancelar</button></form>:
    <><span className="closure-name">{r.name}{r.system&&<small>Automático</small>}{r.createdByAi&&<small>Criado pela IA</small>}{!r.active&&<small>Inativo</small>}</span><span className="closure-row-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setEditing({id:r.id,name:r.name})}>Renomear</button>{!r.system&&<button type="button" className="secondary" disabled={busy} onClick={()=>run(()=>request('/closure-reasons/'+r.id,{name:r.name,active:!r.active}),r.active?'Motivo desativado.':'Motivo reativado.')}>{r.active?'Desativar':'Reativar'}</button>}</span></>}
   </li>)}</ul>
  </>}
 </section>;
}

// Quadro do relatório de atendimentos: finalizados por motivo no período.
export function ClosureReasonsReport({connectionId,from,to,refreshKey}){
 const [data,setData]=useState(null),[error,setError]=useState('');
 useEffect(()=>{let active=true;setError('');request('/closure-reasons/report?'+new URLSearchParams({from,to,connections:connectionId})).then(d=>{if(active)setData(d);}).catch(e=>{if(active){setData(null);setError(e.message);}});return()=>{active=false;};},[connectionId,refreshKey]);
 const max=Math.max(1,...(data?.reasons||[]).map(r=>r.total));
 return <section className="panel closure-report" aria-label="Motivos de finalização"><div className="closure-report-head"><h3>Motivos de finalização</h3>{data&&<span className="muted">{data.closed} finalizado{data.closed===1?'':'s'} no período{data.withoutReason?` · ${data.withoutReason} sem motivo`:''}</span>}</div>
  {error?<p role="alert" className="banner error">{error}</p>:!data?<p className="muted">Carregando…</p>:!data.reasons.length?<p className="muted">Nenhum atendimento finalizado com motivo no período.</p>:
  <ul className="closure-bars">{data.reasons.map(r=><li key={r.id}><span className="closure-bar-label" title={r.name}>{r.name}</span><span className="closure-bar"><span style={{width:(r.total/max*100)+'%'}} className={r.system?'system':''}/></span><strong>{r.total}</strong><small>{data.closed?Math.round(r.total/data.closed*100):0}%</small></li>)}</ul>}
  {data?.reasons.length>0&&<p className="muted closure-note">Um atendimento finalizado com mais de um motivo conta em cada motivo.</p>}
 </section>;
}
