import './related-history.css';
import './new-ticket.css';
import {initialTicketConnection,initialTicketMessage,initialTicketPurpose,restoreTicketAssignment,saveTicketPreferences} from './ticket-preferences.js';
import {ContactPicker} from './contact-picker.jsx';
import React,{useEffect,useRef,useState} from 'react';
import {Sparkles,X} from 'lucide-react';
import {request} from './account.jsx';
import {scoped} from './manage.jsx';
const MESSAGE_LIMIT=1000;
export function NewTicket({connections,user,onClose,onOpen}){
 const dialog=useRef(null),[connection,setConnection]=useState(()=>initialTicketConnection(user,connections)),[contact,setContact]=useState(null),[fresh,setFresh]=useState(false),[name,setName]=useState(''),[phone,setPhone]=useState(''),[department,setDepartment]=useState(''),[owner,setOwner]=useState(user.id),[departments,setDepartments]=useState([]),[people,setPeople]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[sendModel,setSendModel]=useState(true),[purpose,setPurpose]=useState(()=>initialTicketPurpose(user,connections)),[preview,setPreview]=useState(null),[checking,setChecking]=useState(false),[previewError,setPreviewError]=useState(''),[consent,setConsent]=useState(false),[aiOnReply,setAIOnReply]=useState(true),[requestId,setRequestId]=useState(()=>crypto.randomUUID());
 const [message,setMessage]=useState(()=>initialTicketMessage(user,connections)),[restored,setRestored]=useState(()=>!!initialTicketMessage(user,connections)),[mode,setMode]=useState('natural'),[suggestion,setSuggestion]=useState(''),[improving,setImproving]=useState(false),[aiError,setAIError]=useState('');
 const target=fresh?phone:contact?.phone,typed=message.trim();
 useEffect(()=>{dialog.current.showModal();return()=>dialog.current?.close();},[]);
 useEffect(()=>{let alive=true;setContact(null);setDepartment('');setDepartments([]);setPeople([]);if(connection)Promise.all([request(scoped('/ticket-departments',connection)),request(scoped('/attendants',connection))]).then(([d,p])=>{if(alive){setDepartments(d.filter(x=>x.active!==false));setPeople(p);const primary=connections.find(c=>c.id===connection)?.primaryDepartmentId;const saved=restoreTicketAssignment(user,connection,d,p,primary);setDepartment(saved.department);setOwner(saved.owner);setPurpose(saved.purpose);setMessage(saved.message);setRestored(!!saved.message);setSuggestion('');saveTicketPreferences(user,connection,{department:saved.department,owner:saved.owner,purpose:saved.purpose});}}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[connection]);
 // A autorização do cliente vale para o contato e o número; mudar o texto não pede nova confirmação.
 useEffect(()=>{setConsent(false);},[connection,target]);
 useEffect(()=>{let alive=true;setPreview(null);setPreviewError('');setRequestId(crypto.randomUUID());setChecking(!!(sendModel&&target));const timer=setTimeout(async()=>{if(!sendModel||!target)return;try{const r=await request('/contacts/open-preview',{connectionId:connection,phone:target,purpose,message:typed});if(alive)setPreview(r);}catch(e){if(alive)setPreviewError(e.message);}finally{if(alive)setChecking(false);}},500);return()=>{alive=false;clearTimeout(timer);};},[connection,target,purpose,sendModel,typed]);
 useEffect(()=>{setRequestId(crypto.randomUUID());},[department,owner,name,aiOnReply]);
 async function improve(){setImproving(true);setAIError('');setSuggestion('');try{const r=await request('/contacts/improve-opening',{connectionId:connection,text:message,mode,purpose});setSuggestion(r.text);}catch(e){setAIError(e.message);}finally{setImproving(false);}}
 async function open(e){e.preventDefault();setBusy(true);setError('');let opened=false;try{
  if(sendModel){const result=await request('/contacts/open-and-send',{connectionId:connection,phone:target,name,createContact:fresh,departmentId:department,userId:owner||null,purpose,message:typed,aiOnReply,requestId,consentConfirmed:consent,fingerprint:preview?.template?.fingerprint});if(result.error){opened=true;throw Error(result.error);}if(typed&&(preview?.sendsText||preview?.custom))saveTicketPreferences(user,connection,{message:typed});onOpen({connectionId:connection,telefone:result.phone,ticketId:result.lead.ticketId});return;}
  let selected=contact?.phone;if(fresh){const saved=await request('/contacts/save',{connectionId:connection,name,phone});selected=saved.phone;}if(!selected)throw Error('Escolha um contato.');const lead=await request('/contacts/open',{connectionId:connection,phone:selected});opened=true;await request(scoped('/leads/'+selected+'/transfer',connection),{userId:owner||null,departmentId:department||null,ticketId:lead.ticketId});onOpen({connectionId:connection,telefone:selected,ticketId:lead.ticketId});
 }catch(e){setError((opened?'O chamado foi aberto, mas o envio ou a atribuição não foi concluído. Confira antes de tentar novamente. ':'')+e.message);}finally{setBusy(false);}}
 const blockedReason=!connection?'Escolha o número de saída.':!fresh&&!contact?'Selecione um contato na busca.':!department?'Selecione a Fila / setor para abrir o chamado.':sendModel&&!checking&&preview&&!preview.windowOpen&&!consent?'Confirme que o cliente autorizou este contato.':'';
 const ready=!sendModel||!checking&&preview&&(preview.windowOpen||consent&&preview.template);
 const action=!sendModel?'Abrir chamado':preview?.windowOpen?(typed?'Abrir e enviar mensagem':'Abrir chamado'):preview?.custom?'Abrir e enviar sua mensagem':'Abrir e enviar modelo aprovado';
 const people_=people.filter(p=>!department||departments.find(d=>d.id===department)?.users?.includes(p.id));
 return <dialog ref={dialog} className="new-ticket-dialog nt" aria-labelledby="nt-title" onCancel={e=>{e.preventDefault();if(!busy)onClose();}}><form className="nt-form" onSubmit={open}>
  <header className="nt-head"><div><h2 id="nt-title">Novo chamado</h2><p>Escolha o contato, a fila e a mensagem de abertura.</p></div><button type="button" className="nt-close" aria-label="Fechar" disabled={busy} onClick={onClose}><X size={20}/></button></header>
  <div className="nt-body">
   <fieldset className="nt-card"><legend>Contato</legend>
    <label>Número de saída<select required disabled={busy} value={connection} onChange={e=>{setConnection(e.target.value);saveTicketPreferences(user,e.target.value);}}>{connections.filter(c=>!c.channel||c.channel==='whatsapp').map(c=><option key={c.id} value={c.id}>{c.name} · {c.displayPhone}</option>)}</select></label>
    <label className="nt-check"><input type="checkbox" checked={fresh} disabled={busy} onChange={e=>setFresh(e.target.checked)}/>Cadastrar novo contato</label>
    {fresh?<div className="nt-row"><label>Nome<input required maxLength={120} value={name} disabled={busy} onChange={e=>setName(e.target.value)}/></label><label>Telefone com DDD<input required inputMode="tel" placeholder="(88) 99999-0000" disabled={busy} value={phone} onChange={e=>setPhone(e.target.value)}/></label></div>:<ContactPicker connection={connection} disabled={busy} contact={contact} onSelect={setContact}/>}
   </fieldset>
   <fieldset className="nt-card"><legend>Atendimento</legend><div className="nt-row">
    <label>Fila / setor<select id="new-ticket-department" aria-invalid={!department||undefined} required disabled={busy} value={department} onChange={e=>{setDepartment(e.target.value);const nextOwner=departments.find(d=>d.id===e.target.value)?.users?.includes(owner)?owner:'';setOwner(nextOwner);saveTicketPreferences(user,connection,{department:e.target.value,owner:nextOwner});}}><option value="" disabled>Selecione o setor</option>{departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
    <label>Responsável<select required={!department} disabled={busy} value={owner} onChange={e=>{setOwner(e.target.value);saveTicketPreferences(user,connection,{department,owner:e.target.value});}}><option value="">Aguardar na fila do setor</option>{people_.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
   </div></fieldset>
   <fieldset className="nt-card nt-message"><legend>Mensagem de abertura</legend>
    <label className="nt-check"><input type="checkbox" checked={sendModel} disabled={busy} onChange={e=>setSendModel(e.target.checked)}/>Enviar mensagem ao abrir o chamado</label>
    {sendModel?<>
     <label><span>Objetivo do contato <span className="nt-optional">(opcional)</span></span><input maxLength={500} placeholder="Ex.: apresentar o sistema para uma oficina" value={purpose} disabled={busy} onChange={e=>{setPurpose(e.target.value);saveTicketPreferences(user,connection,{purpose:e.target.value});}}/></label>
     <label htmlFor="nt-text"><span>Sua mensagem <span className="nt-optional">(opcional)</span></span></label>
     <div className="nt-compose">
      <textarea id="nt-text" rows={4} maxLength={MESSAGE_LIMIT} placeholder="Escreva como você quer iniciar a conversa. Em branco, a plataforma escolhe uma mensagem aprovada." value={message} disabled={busy} onChange={e=>{setMessage(e.target.value);setRestored(false);setSuggestion('');}}/>
      <div className="nt-compose-bar">
       <select aria-label="Como melhorar" value={mode} disabled={busy||improving} onChange={e=>setMode(e.target.value)}><option value="natural">Mais natural</option><option value="persuasive">Mais persuasiva</option><option value="short">Mais curta</option></select>
       <button type="button" className="nt-ai-button" disabled={busy||improving||!typed} onClick={improve}><Sparkles size={15}/>{improving?'Melhorando…':'Melhorar com IA'}</button>
       <span className="nt-count" aria-live="polite">{message.length}/{MESSAGE_LIMIT}</span>
      </div>
     </div>
     {restored&&<small className="nt-hint">Última mensagem de abertura enviada por este número. <button type="button" className="nt-link" onClick={()=>{setMessage('');setRestored(false);}}>Limpar</button></small>}
     {aiError&&<p className="error" role="alert">{aiError}</p>}
     {suggestion&&<section className="nt-suggestion" aria-label="Sugestão da IA"><strong><Sparkles size={14}/> Sugestão da IA</strong><textarea aria-label="Sugestão editável" rows={4} maxLength={MESSAGE_LIMIT} value={suggestion} onChange={e=>setSuggestion(e.target.value)}/><div><button type="button" className="secondary" onClick={()=>setSuggestion('')}>Descartar</button><button type="button" className="secondary" disabled={improving} onClick={improve}>Gerar outra</button><button type="button" disabled={!suggestion.trim()} onClick={()=>{setMessage(suggestion.trim());setSuggestion('');setRestored(false);}}>Usar sugestão</button></div></section>}
     <Preview target={target} checking={checking} preview={preview} typed={typed}/>
     {previewError&&<p className="error" role="alert">{previewError}</p>}
     {preview&&!preview.windowOpen&&preview.template&&<label className="nt-check"><input type="checkbox" checked={consent} disabled={busy} onChange={e=>setConsent(e.target.checked)}/>Confirmo que este cliente autorizou receber contato comercial da empresa.</label>}
     <label className="nt-check"><input type="checkbox" checked={aiOnReply} disabled={busy} onChange={e=>setAIOnReply(e.target.checked)}/>Deixar a IA atender quando o cliente responder</label>
     <small>Um telefone público encontrado no Google não comprova autorização. O cadastro do contato não envia mensagens por si só.</small>
    </>:<small>O chamado será aberto e atribuído sem enviar mensagem.</small>}
   </fieldset>
   <small className="nt-foot-note">Um chamado já aberto será reutilizado.</small>
  </div>
  <footer className="nt-foot">
   {error&&<p role="alert" className="error">{error}</p>}
   {blockedReason&&<div id="new-ticket-requirement" className="new-ticket-requirement" role="status">{blockedReason}{!department&&contact&&<button type="button" className="secondary" onClick={()=>document.getElementById('new-ticket-department')?.focus()}>Selecionar fila / setor</button>}</div>}
   <div className="nt-actions"><button type="button" className="secondary" disabled={busy} onClick={onClose}>Cancelar</button><button aria-describedby={blockedReason?'new-ticket-requirement':undefined} disabled={busy||!connection||(!fresh&&!contact)||!department||!ready}>{busy?'Processando…':action}</button></div>
  </footer>
 </form></dialog>;
}
function Preview({target,checking,preview,typed}){
 if(!target)return <div className="nt-preview nt-preview-muted" role="status">Escolha o contato para ver o que será enviado.</div>;
 if(checking)return <div className="nt-preview nt-preview-muted" role="status">Conferindo a janela de 24h e os modelos aprovados…</div>;
 if(!preview)return null;
 if(preview.windowOpen)return <div className="nt-preview" role="status"><strong>{typed?'Vai a sua mensagem':'Nada será enviado'}</strong><span>{typed?'O cliente falou nas últimas 24h, então sua mensagem segue como texto normal.':'O cliente falou nas últimas 24h. Escreva uma mensagem acima se quiser enviar algo ao abrir.'}</span>{typed&&<p className="nt-bubble">{typed}</p>}</div>;
 const t=preview.template;if(!t)return null;
 return <div className={'nt-preview'+(preview.customUnavailable?' nt-preview-warn':'')} role="status">
  <strong>{preview.custom?'Vai a sua mensagem, dentro do modelo aprovado':preview.customUnavailable?'Sua mensagem não pode ir agora':'Mensagem escolhida pela plataforma'}</strong>
  {preview.customUnavailable&&<span>Fora da janela de 24h a Meta só aceita modelo aprovado, e ainda não há um modelo que leve texto livre. Vai a mensagem abaixo; quando o cliente responder, você conversa livremente.</span>}
  <p className="nt-bubble">{t.body}</p>
  {t.buttons?.map((button,index)=><span key={index} className="nt-bubble-button">{button.text}{button.type==='URL'?' ↗':''}</span>)}
  <small>{t.name} · {t.language}. Depois, aguarde a resposta para enviar texto livre.</small>
 </div>;
}
