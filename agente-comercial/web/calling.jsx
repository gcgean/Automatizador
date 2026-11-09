import React,{useEffect,useRef,useState} from 'react';
import {Phone,PhoneIncoming,PhoneOff,Mic,MicOff} from 'lucide-react';
import {request} from './account.jsx';
import {scoped} from './manage.jsx';
import './calling.css';

const terminal=new Set(['ended','rejected','failed']);
const labels={cancel_pending:'Encerramento solicitado — aguardando Meta',starting:'Preparando ligação',ringing:'Chamando',active:'Em ligação',uncertain:'Aguardando confirmação da Meta',ended:'Encerrada',rejected:'Não atendida / recusada',failed:'Falha na ligação'};
const microphoneError=e=>e.name==='NotAllowedError'?'Permita o microfone no navegador para conversar por ligação.':e.name==='NotFoundError'?'Conecte um microfone para conversar por ligação.':e.message;
export default function Calling({connectionId,contact,user,onActive}){
 const [clientId]=useState(()=>crypto.randomUUID());
 const [settings,setSettings]=useState(null),[calls,setCalls]=useState([]),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[muted,setMuted]=useState(false),[online,setOnline]=useState(false),[confirmPermission,setConfirmPermission]=useState(false);
 const audio=useRef(null),peer=useRef(null),stream=useRef(null),current=useRef(null),live=useRef(true),pollBusy=useRef(false),starting=useRef(false),answerApplied=useRef(false),ring=useRef(null),ringed=useRef(''),onlineRef=useRef(false),busyRef=useRef(false);
 const api=(path,body)=>request(scoped(path,connectionId),body);
 function release(){peer.current?.close();peer.current=null;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;answerApplied.current=false;if(audio.current)audio.current.srcObject=null;}
 async function disconnect(){const id=current.current;release();current.current=null;if(id)await api('/calls/'+id+'/terminate',{clientId}).catch(()=>{});}
 useEffect(()=>{
  live.current=true;
  api('/calls/settings').then(s=>{if(live.current)setSettings(s);}).catch(e=>{if(live.current)setError(e.message);});
  async function poll(){
   if(pollBusy.current||!live.current)return;pollBusy.current=true;
   try{
    const items=await api('/calls?clientId='+clientId);if(!live.current)return;setCalls(items);
    const mine=items.find(c=>c.id===current.current);
    if(mine){
     if(terminal.has(mine.state)){release();current.current=null;onActive(false);setNotice('Ligação encerrada. O atendimento continua com a equipe.');}
     else{
      await api('/calls/'+mine.id+'/heartbeat',{clientId});
      if(mine.direction==='BUSINESS_INITIATED'&&mine.session?.sdp_type==='answer'&&peer.current&&!answerApplied.current){answerApplied.current=true;try{await peer.current.setRemoteDescription({type:'answer',sdp:mine.session.sdp});}catch(e){answerApplied.current=false;throw e;}}
     }
    }
    const incoming=items.find(c=>c.direction==='USER_INITIATED'&&c.state==='ringing'&&!c.operatorName);
    if(incoming&&onlineRef.current&&ring.current&&ringed.current!==incoming.id){ringed.current=incoming.id;const context=ring.current;await context.resume();const osc=context.createOscillator(),gain=context.createGain();osc.frequency.value=660;gain.gain.value=.08;osc.connect(gain);gain.connect(context.destination);osc.start();osc.stop(context.currentTime+.5);}
   }catch(e){if(live.current)setError(e.message);}finally{pollBusy.current=false;}
  }
  poll();const timer=setInterval(poll,1000);
  const unload=()=>release();window.addEventListener('pagehide',unload);
  return()=>{live.current=false;clearInterval(timer);window.removeEventListener('pagehide',unload);disconnect();ring.current?.close();};
 },[]);
 useEffect(()=>{setConfirmPermission(false);},[contact?.telefone]);
 function run(fn){if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');setNotice('');Promise.resolve().then(fn).catch(e=>{if(live.current)setError(microphoneError(e));}).finally(()=>{busyRef.current=false;if(live.current)setBusy(false);});}
 async function available(){
  if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)throw new Error('Use um navegador atualizado com HTTPS e suporte a microfone.');
  const test=await navigator.mediaDevices.getUserMedia({audio:true});test.getTracks().forEach(t=>t.stop());
  ring.current??=new AudioContext();await ring.current.resume();onlineRef.current=true;setOnline(true);setNotice('Atendimento de ligações ativado neste navegador. Mantenha este painel aberto.');
 }
 async function makePeer(){
  if(peer.current)throw new Error('Já existe uma ligação neste navegador.');
  const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
  if(!live.current){media.getTracks().forEach(t=>t.stop());throw new Error('Atendimento encerrado.');}
  stream.current=media;const pc=new RTCPeerConnection({iceServers:settings?.iceServers||[]});peer.current=pc;setMuted(false);
  media.getTracks().forEach(t=>pc.addTrack(t,media));
  pc.ontrack=e=>{if(audio.current){audio.current.srcObject=e.streams[0]||new MediaStream([e.track]);audio.current.play().catch(()=>setError('Clique em Ouvir ligação para liberar o áudio do navegador.'));}};
  pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed'){setError('A conexão de áudio falhou. Confira a rede e tente novamente após encerrar.');disconnect().finally(()=>onActive(false));}};
  return pc;
 }
 async function localSession(pc,description){
  await pc.setLocalDescription(description);
  if(pc.iceGatheringState!=='complete')await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{pc.removeEventListener('icegatheringstatechange',check);reject(new Error('A rede não concluiu a conexão de áudio. Verifique o firewall ou a configuração TURN.'));},12000);function check(){if(pc.iceGatheringState==='complete'){clearTimeout(timeout);pc.removeEventListener('icegatheringstatechange',check);resolve();}}pc.addEventListener('icegatheringstatechange',check);check();});
  return {sdp_type:pc.localDescription.type,sdp:pc.localDescription.sdp};
 }
 async function start(){
  if(starting.current||current.current)return;starting.current=true;
  try{
   const to=contact?.telefone;if(!to)throw new Error('Selecione um contato para ligar.');
   const p=await api('/calls/permission?phone='+encodeURIComponent(to));
   if(!p.actions?.some(a=>a.action_name==='start_call'&&a.can_perform_action)){setConfirmPermission(true);return;}
   const pc=await makePeer(),session=await localSession(pc,await pc.createOffer()),id=crypto.randomUUID();current.current=id;onActive(true);
   // Keep the same request ID on uncertain outcomes; polling reconciles it.
   try{const row=await api('/calls/start',{phone:to,clientId,requestId:id,session});if(live.current)setCalls(items=>[row,...items.filter(c=>c.id!==row.id)]);}
   catch(e){if(e.status&&e.status<500){current.current=null;release();onActive(false);}throw e;}
  }catch(e){if(!current.current)release();throw e;}finally{starting.current=false;}
 }
 async function answer(row){
  if(current.current)return;
  try{
   // Acquire the microphone before reserving the call so permission prompts do not lock it.
   const pc=await makePeer();
   const claimed=await api('/calls/'+row.id+'/claim',{clientId});current.current=row.id;onActive(true);
   if(!claimed.session||claimed.session.sdp_type!=='offer')throw new Error('A oferta de áudio não está disponível.');
   await pc.setRemoteDescription({type:'offer',sdp:claimed.session.sdp});
   const session=await localSession(pc,await pc.createAnswer());
   const accepted=await api('/calls/'+row.id+'/accept',{clientId,session});
   if(live.current)setCalls(items=>items.map(c=>c.id===row.id?accepted:c));
  }catch(e){await disconnect();onActive(false);throw e;}
 }
 async function reject(row){await api('/calls/'+row.id+'/claim',{clientId});current.current=row.id;await api('/calls/'+row.id+'/reject',{clientId});current.current=null;}
 const active=calls.find(c=>c.id===current.current&&!terminal.has(c.state)),locked=!!current.current;
 const incoming=calls.filter(c=>c.direction==='USER_INITIATED'&&c.state==='ringing'&&!c.operatorName);
 const toggleMute=()=>{const value=!muted;stream.current?.getAudioTracks().forEach(t=>t.enabled=!value);setMuted(value);};
 return <section className="calling-panel" aria-label="Ligações WhatsApp">
  <div className="calling-heading"><strong><Phone size={16}/> Ligações WhatsApp</strong><span className="muted">Atendimento pela equipe</span><span className="calling-state">{online?'Disponível neste navegador':'Atendimento desativado neste navegador'}</span></div>
  <div className="calling-actions">
   {!online?<button className="secondary" disabled={busy||!settings||settings.status!=='ENABLED'} onClick={()=>run(available)}>Ativar atendimento de ligações</button>:<button className="secondary" disabled={busy||locked} onClick={()=>{onlineRef.current=false;setOnline(false);setNotice('Atendimento desativado neste navegador.');}}>Ficar indisponível</button>}
   <button disabled={busy||!online||locked||settings?.status!=='ENABLED'||!contact||contact.optedOut} onClick={()=>run(start)}><Phone size={15}/> Ligar{contact?' para '+(contact.nome||contact.nomeWhatsApp||contact.telefone):' para contato selecionado'}</button>
   {user.role==='admin'&&settings&&<button className="secondary" disabled={busy||locked} onClick={()=>run(async()=>{const enabled=settings.visibility!=='DEFAULT'||settings.status!=='ENABLED';setSettings(await api('/calls/settings',{enabled}));setNotice(enabled?'Recebimento habilitado no WhatsApp. Mantenha um atendente disponível.':'Ligações desativadas neste número.');})}>{settings.visibility==='DEFAULT'&&settings.status==='ENABLED'?'Desativar chamadas do número':'Habilitar recebimento no WhatsApp'}</button>}
  </div>
  {confirmPermission&&<div className="calling-consent"><p>O cliente precisa autorizar a ligação. Enviar uma solicitação pelo WhatsApp para <strong>{contact?.nome||contact?.telefone}</strong>?</p><button disabled={busy} onClick={()=>run(async()=>{await api('/calls/permission',{phone:contact.telefone});setConfirmPermission(false);setNotice('Solicitação enviada. Aguarde o cliente autorizar e clique em Ligar novamente.');})}>Enviar solicitação de autorização</button><button className="secondary" disabled={busy} onClick={()=>setConfirmPermission(false)}>Cancelar</button></div>}
  {incoming.map(row=><div className="calling-incoming" role="status" key={row.id}><PhoneIncoming size={20}/><strong>Ligação recebida de +{row.phone}</strong><button disabled={!online||busy||locked} onClick={()=>run(()=>answer(row))}>Atender</button><button className="secondary" disabled={!online||busy||locked} onClick={()=>run(()=>reject(row))}>Recusar</button></div>)}
  {locked&&<div className="calling-active" role="status"><strong>{labels[active?.state]||'Conectando'}{active?' · +'+active.phone:''}</strong><button className="secondary" disabled={!stream.current} onClick={toggleMute}>{muted?<MicOff size={16}/>:<Mic size={16}/>} {muted?'Ativar microfone':'Silenciar'}</button><button className="secondary" onClick={()=>audio.current?.play().then(()=>setError('')).catch(()=>setError('O navegador ainda está bloqueando o áudio.'))}>Ouvir ligação</button><button className="calling-hangup" disabled={busy} onClick={()=>run(async()=>{const result=await api('/calls/'+current.current+'/terminate',{clientId});release();current.current=null;onActive(false);setNotice(result.state==='cancel_pending'?'Encerramento solicitado. Aguarde a confirmação da Meta antes de ligar novamente.':'Ligação encerrada.');})}><PhoneOff size={16}/> Encerrar</button></div>}
  {error&&<p role="alert" className="calling-error">{error}</p>}{notice&&<p role="status">{notice}</p>}
  {!online&&incoming.length>0&&<p>Ative o atendimento para usar o microfone e atender.</p>}
  <p className="calling-footnote">Mantenha o painel aberto para receber chamadas. As ligações de saída exigem autorização do cliente e podem ter cobrança da Meta.</p>
  {calls.length>0&&<details><summary>Últimas ligações</summary><ul className="calling-history">{calls.slice(0,5).map(c=><li key={c.id}><span>{c.direction==='USER_INITIATED'?'Recebida':'Realizada'} · +{c.phone}</span><span>{labels[c.state]||c.state}{c.operatorName?' · '+c.operatorName:''}</span></li>)}</ul></details>}
  <audio ref={audio} autoPlay/>
 </section>;
}
