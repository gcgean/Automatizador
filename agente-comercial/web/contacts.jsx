import React,{useEffect,useRef,useState} from 'react';
import {Pencil,Search,UserPlus,Upload,MessageSquare,History,Smartphone,X,Check} from 'lucide-react';
import {request} from './account.jsx';
import './contacts.css';
import {parseVcf,parseCsv} from './contact-import.js';

// ── Renomear contato (conversa, cards e lista) ──────────────────────────────
let pendingRename=null;
const renameKey=(connectionId,phone)=>connectionId+'|'+phone;
// Usado pelo lápis do card: seleciona a conversa e abre o nome em edição no cabeçalho.
export function requestRename(connectionId,phone){pendingRename=renameKey(connectionId,phone);window.dispatchEvent(new CustomEvent('command-rename-contact',{detail:pendingRename}));}
export function ContactName({name,connectionId,phone,canEdit=true,onSave,as:Tag='h2',className=''}){
 const [editing,setEditing]=useState(false),[draft,setDraft]=useState(name),[busy,setBusy]=useState(false),[error,setError]=useState(''),key=renameKey(connectionId,phone);
 const start=()=>{setDraft(name);setError('');setEditing(true);};
 // Ao trocar de contato fecha a edição, exceto se o lápis do card pediu para renomear este.
 useEffect(()=>{if(canEdit&&pendingRename===key){pendingRename=null;start();}else setEditing(false);},[key]);
 useEffect(()=>{if(!canEdit)return;const listen=e=>{if(e.detail===key){pendingRename=null;start();}};window.addEventListener('command-rename-contact',listen);return()=>window.removeEventListener('command-rename-contact',listen);},[key,canEdit,name]);
 async function save(e){e.preventDefault();const value=draft.trim();if(!value||value===name){setEditing(false);return;}setBusy(true);setError('');try{const ok=await onSave(value);if(ok!==false)setEditing(false);}catch(err){setError(err.message);}finally{setBusy(false);}}
 if(editing)return <form className={'contact-rename '+className} onSubmit={save} onClick={e=>e.stopPropagation()}><input aria-label="Nome do contato" value={draft} maxLength={120} autoFocus disabled={busy} onChange={e=>setDraft(e.target.value)} onKeyDown={e=>{if(e.key==='Escape')setEditing(false);}}/><button className="icon-button" aria-label="Salvar nome" title="Salvar" disabled={busy}><Check size={15}/></button><button type="button" className="icon-button" aria-label="Cancelar" title="Cancelar" onClick={()=>setEditing(false)}><X size={15}/></button>{error&&<small role="alert">{error}</small>}</form>;
 return <Tag className={'contact-name '+className}>{canEdit?<button type="button" className="contact-name-button" title="Clique para renomear o contato" onClick={start}>{name}<Pencil size={12} aria-hidden="true"/></button>:name}</Tag>;
}

// ── Importação: .vcf (agenda exportada), .csv ou agenda do celular ──────────
const validPhone=p=>{const d=String(p||'').replace(/\D/g,'');return d.length>=10&&d.length<=15;};

function ImportPanel({connections,onDone,onClose}){
 const [connectionId,setConnectionId]=useState(connections[0]?.id||''),[items,setItems]=useState(null),[source,setSource]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[result,setResult]=useState(null),file=useRef(null);
 const picker=typeof navigator!=='undefined'&&'contacts' in navigator&&'select' in navigator.contacts;
 async function readFile(f){setError('');setResult(null);if(!f)return;if(f.size>5*1024*1024){setError('Arquivo muito grande (máximo 5 MB).');return;}const text=await f.text();const list=/\.vcf$/i.test(f.name)||/BEGIN:VCARD/i.test(text)?parseVcf(text):parseCsv(text);setItems(list);setSource(f.name);}
 async function fromPhone(){setError('');setResult(null);try{const picked=await navigator.contacts.select(['name','tel'],{multiple:true});setItems(picked.flatMap(c=>c.tel?.length?[{name:(c.name||[])[0]||'',phone:c.tel[0]}]:[]));setSource('agenda do celular');}catch(e){if(e?.name!=='AbortError')setError('Não foi possível ler a agenda deste aparelho.');}}
 const valid=(items||[]).filter(c=>c.name&&validPhone(c.phone));
 async function send(){setBusy(true);setError('');try{const r=await request('/contacts/import',{connectionId,contacts:valid.slice(0,5000)});setResult(r);setItems(null);onDone();}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="contacts-panel" aria-label="Importar contatos"><div className="contacts-panel-head"><h3>Importar contatos</h3><button type="button" className="icon-button" aria-label="Fechar importação" onClick={onClose}><X size={16}/></button></div>
  <p className="muted">Exporte a agenda do celular como arquivo <strong>.vcf</strong> (Contatos → Exportar) ou use uma planilha <strong>.csv</strong> com colunas de nome e telefone. Contatos que já existem não têm o nome trocado. Nenhuma mensagem é enviada.</p>
  <div className="contacts-form-row"><label>Salvar no número<select value={connectionId} onChange={e=>setConnectionId(e.target.value)}>{connections.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <input ref={file} type="file" accept=".vcf,.csv,text/vcard,text/csv" hidden onChange={e=>{readFile(e.target.files[0]);e.target.value='';}}/>
   <button type="button" className="secondary" onClick={()=>file.current.click()}><Upload size={15}/>Escolher arquivo .vcf ou .csv</button>
   {picker&&<button type="button" className="secondary" onClick={fromPhone}><Smartphone size={15}/>Escolher da agenda do celular</button>}</div>
  {!picker&&<p className="muted contacts-hint">A escolha direta na agenda funciona no Chrome do Android. No iPhone e no computador, use o arquivo .vcf.</p>}
  {items&&<div className="contacts-preview"><p><strong>{valid.length}</strong> contato{valid.length===1?'':'s'} pronto{valid.length===1?'':'s'} para importar de {source}{items.length-valid.length>0?` · ${items.length-valid.length} sem nome ou telefone válido serão ignorados`:''}{valid.length>5000?' · serão importados os 5.000 primeiros':''}.</p>
   <ul>{valid.slice(0,5).map((c,i)=><li key={i}>{c.name} · {c.phone}</li>)}{valid.length>5&&<li>…</li>}</ul>
   <button type="button" disabled={busy||!valid.length||!connectionId} onClick={send}>{busy?'Importando…':'Importar '+Math.min(valid.length,5000)+' contatos'}</button></div>}
  {result&&<p role="status" className="banner success">Importação concluída: {result.created} novos, {result.named} receberam nome, {result.unchanged} já existiam, {result.invalid} ignorados.</p>}
  {error&&<p role="alert" className="banner error">{error}</p>}
 </section>;
}

function NewContact({connections,onSaved,onClose}){
 const [form,setForm]=useState({connectionId:connections[0]?.id||'',name:'',phone:'',company:''}),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const set=(k,v)=>setForm(f=>({...f,[k]:v}));
 async function save(e){e.preventDefault();setBusy(true);setError('');try{const r=await request('/contacts/save',form);onSaved(r);}catch(err){setError(err.message);}finally{setBusy(false);}}
 return <form className="contacts-panel" onSubmit={save} aria-label="Novo contato"><div className="contacts-panel-head"><h3>Salvar contato</h3><button type="button" className="icon-button" aria-label="Fechar" onClick={onClose}><X size={16}/></button></div>
  <div className="contacts-form-row"><label>Número<select value={form.connectionId} onChange={e=>set('connectionId',e.target.value)}>{connections.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
   <label>Nome<input required maxLength={120} value={form.name} onChange={e=>set('name',e.target.value)} placeholder="Nome do contato"/></label>
   <label>Telefone (com DDD)<input required inputMode="tel" value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="(88) 99999-0000"/></label>
   <label>Empresa<input maxLength={120} value={form.company} onChange={e=>set('company',e.target.value)} placeholder="Opcional"/></label>
   <button disabled={busy}>{busy?'Salvando…':'Salvar contato'}</button></div>
  <p className="muted contacts-hint">Salvar não abre chamado nem envia mensagem. Para conversar, use “Abrir chamado” na lista.</p>
  {error&&<p role="alert" className="banner error">{error}</p>}
 </form>;
}

const when=d=>d?new Date(d).toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit'}):'—';
const status=c=>c.optedOut?['Não contatar','blocked']:c.hasOpenTicket?['Em atendimento','open']:c.messages?['Finalizado','closed']:['Sem conversa','none'];

export function Contacts({canManage=true,onOpenConversation}){
 const [data,setData]=useState(null),[q,setQ]=useState(''),[connection,setConnection]=useState(''),[panel,setPanel]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[working,setWorking]=useState('');
 async function load(offset=0){setBusy(true);setError('');try{const r=await request('/contacts?'+new URLSearchParams({q,connection,offset,limit:100}));setData(d=>offset&&d?{...r,items:[...d.items,...r.items]}:r);}catch(e){setError(e.message);}finally{setBusy(false);}}
 useEffect(()=>{const t=setTimeout(()=>load(0),q?300:0);return()=>clearTimeout(t);},[q,connection]);
 const target=(c,closed)=>({connection_id:c.connectionId,phone:c.phone,conversation_closed:closed,lead_outcome:c.outcome,lead_status:c.status});
 const open=c=>onOpenConversation(target(c,c.conversationClosed));
 async function openTicket(c){if(c.hasOpenTicket){open(c);return;}setWorking(c.connectionId+c.phone);setError('');try{await request('/contacts/open',{connectionId:c.connectionId,phone:c.phone});onOpenConversation(target({...c,status:c.status==='encaminhado'?'encaminhado':''},false));}catch(e){setError(e.message);}finally{setWorking('');}}
 async function rename(c,name){await request('/contacts/rename',{connectionId:c.connectionId,phone:c.phone,name});setData(d=>({...d,items:d.items.map(x=>x===c?{...x,name}:x)}));setNotice('Contato renomeado.');}
 const connections=data?.connections||[];
 return <section className="contacts-page" aria-label="Contatos">
  <div className="contacts-title"><div><h1>Contatos</h1><p className="muted">Todos os contatos dos seus números. Abra um chamado, veja o histórico ou renomeie.</p></div>
   {canManage&&<div className="contacts-actions"><button type="button" onClick={()=>setPanel(panel==='new'?'':'new')}><UserPlus size={15}/>Novo contato</button><button type="button" className="secondary" onClick={()=>setPanel(panel==='import'?'':'import')}><Upload size={15}/>Importar contatos</button></div>}</div>
  {panel==='new'&&connections.length>0&&<NewContact connections={connections} onClose={()=>setPanel('')} onSaved={r=>{setPanel('');setNotice(r.created?'Contato salvo.':'Este telefone já existia; o nome foi atualizado.');load(0);}}/>}
  {panel==='import'&&connections.length>0&&<ImportPanel connections={connections} onClose={()=>setPanel('')} onDone={()=>load(0)}/>}
  <div className="contacts-toolbar"><div className="search"><Search size={15}/><input aria-label="Buscar contato" placeholder="Buscar por nome, telefone ou empresa" value={q} onChange={e=>setQ(e.target.value)}/></div>
   <select aria-label="Filtrar por número" value={connection} onChange={e=>setConnection(e.target.value)}><option value="">Todos os números</option>{connections.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></div>
  {notice&&<p role="status" className="banner success">{notice}<button type="button" className="icon-button" aria-label="Fechar aviso" onClick={()=>setNotice('')}><X size={14}/></button></p>}
  {error&&<p role="alert" className="banner error">{error}</p>}
  <div className="panel contacts-table-wrap"><table className="contacts-table"><thead><tr><th>Contato</th><th>Telefone</th><th>Número</th><th>Empresa</th><th>Última conversa</th><th>Situação</th><th aria-label="Ações"/></tr></thead>
   <tbody>{data?.items.map(c=>{const [label,tone]=status(c),id=c.connectionId+c.phone;return <tr key={id}>
    <td><ContactName as="span" name={c.name||c.whatsappName||'Sem nome'} connectionId={c.connectionId} phone={c.phone} canEdit={canManage} onSave={name=>rename(c,name)}/>{c.name&&c.whatsappName&&c.whatsappName!==c.name&&<small className="contacts-wa" title="Nome no WhatsApp">WhatsApp: {c.whatsappName}</small>}</td>
    <td className="contacts-phone">+{c.phone}</td>
    <td><span className="contacts-conn" style={{'--c':c.connectionColor||'#64748b'}}>{c.connectionName}</span></td>
    <td>{c.company||'—'}</td><td>{when(c.lastMessageAt)}</td>
    <td><span className={'contacts-status '+tone}>{label}</span></td>
    <td className="contacts-row-actions">{canManage&&!c.optedOut&&<button type="button" className="secondary" disabled={working===id} onClick={()=>openTicket(c)} title={c.hasOpenTicket?'Ir para a conversa em andamento':'Abrir um chamado para este contato'}><MessageSquare size={14}/>{c.hasOpenTicket?'Abrir conversa':'Abrir chamado'}</button>}<button type="button" className="secondary" disabled={!c.messages} onClick={()=>open(c)} title={c.messages?'Ver o histórico de conversas':'Ainda não há conversas com este contato'}><History size={14}/>Histórico</button></td>
   </tr>;})}</tbody></table>
   {data&&!data.items.length&&<p className="att-empty contacts-empty">{q?'Nenhum contato encontrado.':'Nenhum contato ainda.'}</p>}
   {busy&&!data&&<p className="muted contacts-empty">Carregando contatos…</p>}
   {data?.hasMore&&<button type="button" className="secondary contacts-more" disabled={busy} onClick={()=>load(data.items.length)}>{busy?'Carregando…':'Carregar mais'}</button>}
  </div>
 </section>;
}
