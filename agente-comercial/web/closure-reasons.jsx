import React,{useEffect,useState} from 'react';
import {request} from './account.jsx';
import './closure-reasons.css';

// Painel aberto ao clicar em Finalizar: escolha de um ou mais motivos.
export function ClosurePanel({busy,onCancel,onConfirm}){
 const [data,setData]=useState(null),[chosen,setChosen]=useState([]),[error,setError]=useState('');
 useEffect(()=>{let active=true;request('/closure-reasons').then(d=>{if(active)setData(d);}).catch(e=>{if(active)setError(e.message);});return()=>{active=false;};},[]);
 const toggle=id=>setChosen(c=>c.includes(id)?c.filter(x=>x!==id):[...c,id]);
 const missing=!!data?.required&&!chosen.length;
 return <div className="transfer-panel closure-panel" role="group" aria-label="Motivo da finalização">
  <div className="closure-reasons-field"><span className="closure-title">Motivo da finalização{data?.required?' (obrigatório)':' (opcional)'}<small>Marque um ou mais.</small></span>
   {error?<p role="alert" className="closure-error">{error}</p>:!data?<p className="muted">Carregando motivos…</p>:!data.reasons.length?<p className="muted">Nenhum motivo cadastrado.</p>:
   <div className="closure-options">{data.reasons.map(r=><label key={r.id} className={chosen.includes(r.id)?'checked':''}><input type="checkbox" checked={chosen.includes(r.id)} onChange={()=>toggle(r.id)}/>{r.name}</label>)}</div>}
  </div>
  <div className="closure-actions"><button type="button" className="secondary" onClick={onCancel}>Cancelar</button><button type="button" disabled={busy||!data||missing} title={missing?'Escolha ao menos um motivo':''} onClick={()=>onConfirm(chosen)}>Finalizar</button></div>
 </div>;
}

// Configurações: cadastro dos motivos e se o motivo é obrigatório.
export function ClosureReasonSettings(){
 const [data,setData]=useState(null),[name,setName]=useState(''),[editing,setEditing]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 useEffect(()=>{request('/closure-reasons?all=1').then(setData).catch(e=>setError(e.message));},[]);
 async function run(fn,message){setBusy(true);setError('');setNotice('');try{setData(await fn());if(message)setNotice(message);return true;}catch(e){setError(e.message);return false;}finally{setBusy(false);}}
 return <section className="closure-settings"><div className="report-heading"><div><h2>Motivos de finalização</h2><p className="muted">Motivos que a equipe escolhe ao finalizar um atendimento. Um atendimento pode ter mais de um motivo. O motivo “Falta de interação” é usado pela cadência quando o cliente não responde às tentativas.</p></div></div>
  {error&&<p role="alert" className="banner error">{error}</p>}{notice&&<p role="status" className="banner success">{notice}</p>}
  {data&&<>
   <label className="closure-required panel"><input type="checkbox" checked={data.required} disabled={busy} onChange={e=>run(()=>request('/closure-reasons/settings',{required:e.target.checked}),e.target.checked?'Motivo obrigatório ao finalizar.':'Motivo opcional ao finalizar.')}/><span><strong>Exigir motivo ao finalizar</strong><small>Quando ligado, o atendimento só é finalizado depois de escolher ao menos um motivo.</small></span></label>
   <form className="closure-add" onSubmit={async e=>{e.preventDefault();if(!name.trim())return;if(await run(()=>request('/closure-reasons',{name}),'Motivo cadastrado.'))setName('');}}><input aria-label="Novo motivo" placeholder="Novo motivo, ex.: Sem interesse" maxLength={80} value={name} onChange={e=>setName(e.target.value)}/><button disabled={busy||!name.trim()}>Adicionar motivo</button></form>
   <ul className="closure-list">{data.reasons.map(r=><li key={r.id} className={r.active?'':'inactive'}>
    {editing?.id===r.id?<form onSubmit={async e=>{e.preventDefault();if(await run(()=>request('/closure-reasons/'+r.id,{name:editing.name}),'Motivo atualizado.'))setEditing(null);}}><input aria-label="Nome do motivo" maxLength={80} value={editing.name} onChange={e=>setEditing({...editing,name:e.target.value})} autoFocus/><button disabled={busy}>Salvar</button><button type="button" className="secondary" onClick={()=>setEditing(null)}>Cancelar</button></form>:
    <><span className="closure-name">{r.name}{r.system&&<small>Cadência</small>}{!r.active&&<small>Inativo</small>}</span><span className="closure-row-actions"><button type="button" className="secondary" disabled={busy} onClick={()=>setEditing({id:r.id,name:r.name})}>Renomear</button>{!r.system&&<button type="button" className="secondary" disabled={busy} onClick={()=>run(()=>request('/closure-reasons/'+r.id,{name:r.name,active:!r.active}),r.active?'Motivo desativado.':'Motivo reativado.')}>{r.active?'Desativar':'Reativar'}</button>}</span></>}
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
