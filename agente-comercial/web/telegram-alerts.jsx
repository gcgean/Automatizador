import React,{useEffect,useMemo,useState} from 'react';
import {Send,Link2,Copy,Check,BellRing,ChevronDown,UserRound,ShieldCheck,ExternalLink,Unlink,FlaskConical,KeyRound} from 'lucide-react';
import {request} from './account.jsx';
import {scoped} from './manage.jsx';
import {ALERT_TYPES,defaultKinds} from '../shared/alert-types.js';
import './telegram-alerts.css';

const GROUPS=[...new Set(ALERT_TYPES.map(a=>a.group))];

function KindPicker({value,onChange,disabled}){
 const toggle=id=>onChange(value.includes(id)?value.filter(k=>k!==id):[...value,id]);
 return <div className="tg-kinds">{GROUPS.map(g=><fieldset key={g}><legend>{g}</legend>{ALERT_TYPES.filter(a=>a.group===g).map(a=><label key={a.id} className={value.includes(a.id)?'on':''}><input type="checkbox" disabled={disabled} checked={value.includes(a.id)} onChange={()=>toggle(a.id)}/><span><strong>{a.label}</strong><small>{a.hint}</small></span></label>)}</fieldset>)}</div>;
}

function Person({person,linked,pending,link,busy,onLink,onKinds,onTest,onRemove}){
 const [open,setOpen]=useState(false),[kinds,setKinds]=useState(linked?.kinds||[]),[copied,setCopied]=useState(false);
 useEffect(()=>{setKinds(linked?.kinds||[]);},[linked?.kinds?.join(',')]);
 const dirty=linked&&kinds.slice().sort().join()!==(linked.kinds||[]).slice().sort().join();
 const status=linked?{cls:'ok',text:'Vinculado · '+(linked.kinds?.length||0)+' alertas'}:pending?{cls:'wait',text:'Aguardando a pessoa tocar em Iniciar'}:{cls:'off',text:'Não vinculado'};
 const copy=async()=>{try{await navigator.clipboard.writeText(link);setCopied(true);setTimeout(()=>setCopied(false),2000);}catch{}};
 return <li className={'tg-person'+(open?' open':'')}>
  <div className="tg-person-row">
   <span className="tg-avatar">{(person.name||person.email||'?').trim().charAt(0).toUpperCase()}</span>
   <div className="tg-person-info"><strong>{person.name||person.email}</strong><span><span className={'tg-badge '+(person.role==='admin'?'admin':'')}>{person.role==='admin'?<><ShieldCheck size={12}/> Gestor</>:<><UserRound size={12}/> Vendedor</>}</span><span className={'tg-status '+status.cls}>{status.text}</span></span></div>
   <div className="tg-person-actions">
    {linked?<button type="button" className="secondary" aria-expanded={open} onClick={()=>setOpen(!open)}><BellRing size={15}/> Alertas <ChevronDown size={14} className="chev"/></button>
     :<button type="button" disabled={busy} onClick={()=>onLink(person.id)}><Link2 size={15}/> {pending?'Gerar novo link':'Gerar link de vínculo'}</button>}
   </div>
  </div>
  {!linked&&link&&<div className="tg-link-box">
   <p><strong>Envie este link para {person.name?.split(' ')[0]||'a pessoa'}</strong> (WhatsApp, e-mail) ou abra no celular dela. Ao tocar em <strong>Iniciar</strong> no Telegram, o vínculo é feito sozinho. Vale por 30 minutos.</p>
   <div className="tg-link"><code>{link}</code><button type="button" className="secondary" onClick={copy}>{copied?<><Check size={14}/> Copiado</>:<><Copy size={14}/> Copiar</>}</button><a className="button secondary" href={link} target="_blank" rel="noreferrer"><ExternalLink size={14}/> Abrir</a></div>
   <small className="muted">Esta tela confere sozinha e muda para “Vinculado” assim que a pessoa iniciar.</small>
  </div>}
  {linked&&open&&<div className="tg-person-body">
   <div className="tg-kinds-head"><span>Escolha o que {person.name?.split(' ')[0]||'a pessoa'} recebe no Telegram</span><span className="tg-quick"><button type="button" className="link" onClick={()=>setKinds(ALERT_TYPES.map(a=>a.id))}>Todos</button><button type="button" className="link" onClick={()=>setKinds(defaultKinds(person.role==='admin'))}>Padrão</button><button type="button" className="link" onClick={()=>setKinds([])}>Nenhum</button></span></div>
   <KindPicker value={kinds} onChange={setKinds} disabled={busy}/>
   <div className="tg-person-foot"><button type="button" disabled={busy||!dirty} onClick={()=>onKinds(person.id,kinds)}>Salvar alertas</button><button type="button" className="secondary" disabled={busy} onClick={()=>onTest(person.id)}><FlaskConical size={15}/> Enviar teste</button><button type="button" className="secondary danger" disabled={busy} onClick={()=>{if(confirm('Desvincular '+(person.name||'esta pessoa')+' do Telegram? Ela deixa de receber alertas.'))onRemove(person.id);}}><Unlink size={15}/> Desvincular</button></div>
  </div>}
 </li>;
}

export function TelegramAlerts({connectionId,user}){
 const admin=user.role==='admin',api=b=>request(scoped('/commercial/telegram',connectionId),b);
 const [status,setStatus]=useState(null),[users,setUsers]=useState([]),[token,setToken]=useState(''),[showToken,setShowToken]=useState(false),[links,setLinks]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[manual,setManual]=useState({userId:'',chatId:''});
 async function load(){setStatus(await api());const u=await request('/users');setUsers((Array.isArray(u)?u:u.users||[]).filter(x=>x.active!==false));}
 useEffect(()=>{if(admin)load().catch(e=>setError(e.message));},[user.company_id]);
 // Enquanto houver link aguardando, confere a cada 4 segundos se a pessoa já iniciou o bot.
 useEffect(()=>{if(!status?.pending?.length)return;const t=setInterval(()=>api({action:'check'}).then(s=>{setStatus(prev=>{const before=new Set(prev?.recipients?.map(r=>r.user_id));const added=s.recipients.filter(r=>!before.has(r.user_id));if(added.length)setNotice(added.map(r=>r.name).join(', ')+' vinculado(a) ao Telegram.');return s;});}).catch(()=>{}),4000);return()=>clearInterval(t);},[status?.pending?.length]);
 async function run(fn,ok){setBusy(true);setError('');setNotice('');try{const r=await fn();if(r?.recipients)setStatus(r);if(ok)setNotice(ok);return r;}catch(e){setError(e.message);}finally{setBusy(false);}}
 const linkedBy=useMemo(()=>Object.fromEntries((status?.recipients||[]).map(r=>[r.user_id,r])),[status]);
 const pendingBy=useMemo(()=>new Set((status?.pending||[]).map(p=>p.user_id)),[status]);
 if(!admin)return <section className="tg-page"><h2>Alertas pelo Telegram</h2><p className="muted">Somente administradores configuram os alertas.</p></section>;
 if(!status)return <section className="tg-page"><h2>Alertas pelo Telegram</h2>{error?<p role="alert" className="banner error">{error}</p>:<p className="muted">Carregando…</p>}</section>;
 const people=[...users].sort((a,b)=>(linkedBy[b.id]?1:0)-(linkedBy[a.id]?1:0)||String(a.name||a.email).localeCompare(String(b.name||b.email)));
 const chip=!status.configured?{cls:'off',text:'Bot não configurado'}:status.enabled?{cls:'ok',text:'Alertas ligados'}:{cls:'wait',text:'Alertas desligados'};
 return <section className="tg-page">
  <header className="tg-head"><div className="tg-head-icon"><Send size={22}/></div><div><h2>Alertas pelo Telegram</h2><p className="muted">Avisos no celular da equipe. Você escolhe quem recebe e quais alertas cada pessoa recebe.</p></div><span className={'tg-chip '+chip.cls}>{chip.text}</span></header>
  {error&&<p role="alert" className="banner error">{error}</p>}{notice&&<p role="status" className="banner success">{notice}</p>}

  <section className="tg-card">
   <div className="tg-card-head"><span className="tg-step">1</span><div><h3>Bot da empresa</h3><p className="muted">{status.configured?<>Bot conectado{status.botUsername?<>: <a href={'https://t.me/'+status.botUsername} target="_blank" rel="noreferrer">@{status.botUsername}</a></>:''}.</>:'Crie um bot no Telegram e cole o token aqui.'}</p></div></div>
   {status.configured&&<label className="tg-switch"><input type="checkbox" checked={status.enabled} disabled={busy} onChange={e=>run(()=>api({enabled:e.target.checked}),e.target.checked?'Alertas ligados.':'Alertas desligados.')}/><span className="track"><span/></span><span>{status.enabled?'Alertas ligados: a equipe recebe os avisos':'Alertas desligados: ninguém recebe avisos'}</span></label>}
   {(!status.configured||showToken)?<form className="tg-token" onSubmit={e=>{e.preventDefault();run(()=>api({token,enabled:true}),'Bot conectado e alertas ligados.').then(r=>{if(r){setToken('');setShowToken(false);}});}}>
    {!status.configured&&<ol className="tg-steps"><li>No Telegram, abra o <strong>@BotFather</strong> e envie <code>/newbot</code>.</li><li>Escolha um nome e um usuário terminado em <code>bot</code>.</li><li>Copie o token que ele responder e cole abaixo. Não envie o token por chat.</li></ol>}
    <label><KeyRound size={15}/><input type="password" autoComplete="new-password" required placeholder="Token do bot (ex.: 123456:ABC…)" value={token} onChange={e=>setToken(e.target.value)}/></label>
    <div className="tg-row"><button disabled={busy||!token}>{status.configured?'Trocar token':'Conectar bot'}</button>{showToken&&<button type="button" className="secondary" onClick={()=>{setShowToken(false);setToken('');}}>Cancelar</button>}</div>
   </form>:<button type="button" className="link" onClick={()=>setShowToken(true)}>Trocar token do bot</button>}
  </section>

  <section className={'tg-card'+(status.configured?'':' disabled')}>
   <div className="tg-card-head"><span className="tg-step">2</span><div><h3>Quem recebe</h3><p className="muted">Gere o link de vínculo da pessoa e envie para ela. Depois de vinculada, escolha os alertas dela.</p></div></div>
   {!status.configured?<p className="muted">Conecte o bot no passo 1 para vincular pessoas.</p>:<ul className="tg-people">{people.map(p=><Person key={p.id} person={p} linked={linkedBy[p.id]} pending={pendingBy.has(p.id)} link={links[p.id]} busy={busy}
     onLink={id=>run(()=>api({action:'link',userId:id})).then(r=>r?.link&&setLinks(l=>({...l,[id]:r.link.url})))}
     onKinds={(id,kinds)=>run(()=>api({action:'kinds',userId:id,kinds}),'Alertas salvos.')}
     onTest={id=>run(()=>api({action:'test',userId:id}),'Teste enviado. Confira o Telegram da pessoa.')}
     onRemove={id=>run(()=>api({enabled:status.enabled,userId:id,remove:true}),'Pessoa desvinculada.')}/>)}</ul>}
  </section>

  {status.configured&&<details className="tg-card tg-advanced"><summary>Vincular manualmente com Chat ID (avançado)</summary>
   <p className="muted">Só se o link não funcionar. O Chat ID é o número que identifica a conversa da pessoa com o bot; ela descobre enviando qualquer mensagem ao <strong>@userinfobot</strong> (campo “Id”).</p>
   <form className="tg-row" onSubmit={e=>{e.preventDefault();const p=users.find(u=>u.id===manual.userId);run(()=>api({enabled:status.enabled,userId:manual.userId,chatId:manual.chatId.trim(),manager:p?.role==='admin'}),'Pessoa vinculada.').then(r=>r&&setManual({userId:'',chatId:''}));}}>
    <select required value={manual.userId} onChange={e=>setManual({...manual,userId:e.target.value})}><option value="">Pessoa</option>{users.map(u=><option key={u.id} value={u.id}>{u.name||u.email}</option>)}</select>
    <input required inputMode="numeric" placeholder="Chat ID" value={manual.chatId} onChange={e=>setManual({...manual,chatId:e.target.value})}/>
    <button disabled={busy}>Vincular</button>
   </form>
  </details>}
 </section>;
}
