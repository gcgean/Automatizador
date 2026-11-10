import React,{createContext,useContext,useEffect,useRef,useState} from 'react';
import {Phone,PhoneIncoming,PhoneOff,Mic,MicOff,X} from 'lucide-react';
import {request} from './account.jsx';
import {scoped} from './manage.jsx';
import {can} from '../shared/access.js';
import './calling.css';
const CallingContext=createContext(null);
const terminal=new Set(['ended','rejected','failed']);
const labels={cancel_pending:'Aguardando encerramento',starting:'Preparando ligação',ringing:'Chamando',active:'Em ligação',uncertain:'Aguardando confirmação da Meta',ended:'Encerrada',rejected:'Não atendida / recusada',failed:'Falha na ligação'};
const microphoneError=e=>e.name==='NotAllowedError'?'Permita o microfone no navegador para conversar por ligação.':e.name==='NotFoundError'?'Conecte um microfone para conversar por ligação.':e.message;
const readyKey=(user,connection)=>'command-calling-ready:'+user.id+':'+connection;
function remembered(user,connection){try{return localStorage.getItem(readyKey(user,connection))==='true';}catch{return false;}}
export function CallingProvider({connectionId,connections,user,onActive,children}){
 const enabled=can(user,'calls.use'),[clientId]=useState(()=>crypto.randomUUID());
 const [settings,setSettings]=useState(null),[calls,setCalls]=useState([]),[active,setActive]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState(''),[muted,setMuted]=useState(false),[online,setOnline]=useState(()=>remembered(user,connectionId)),[permissionTarget,setPermissionTarget]=useState(null);
 const audio=useRef(null),peer=useRef(null),stream=useRef(null),current=useRef(null),live=useRef(true),pollBusy=useRef(false),answerApplied=useRef(false),ring=useRef(null),ringed=useRef(new Set()),busyRef=useRef(false),connectionsRef=useRef(connections),selectedConnection=useRef(connectionId);
 connectionsRef.current=connections;selectedConnection.current=connectionId;
 const api=(connection,path,body)=>request(scoped(path,connection),body);
 function setCurrent(value){current.current=value;setActive(value);onActive(!!value);}
 function release(){peer.current?.close();peer.current=null;stream.current?.getTracks().forEach(t=>t.stop());stream.current=null;answerApplied.current=false;if(audio.current)audio.current.srcObject=null;}
 async function disconnect(){const call=current.current;release();setCurrent(null);if(call)await api(call.connectionId,'/calls/'+call.id+'/terminate',{clientId}).catch(()=>{});}
 function remember(connection,value){try{localStorage.setItem(readyKey(user,connection),String(value));}catch{}if(selectedConnection.current===connection)setOnline(value);}
 async function prepare(connection){
  if(!navigator.mediaDevices?.getUserMedia||!window.RTCPeerConnection)throw new Error('Use um navegador atualizado com HTTPS e suporte a microfone.');
  const test=await navigator.mediaDevices.getUserMedia({audio:true});test.getTracks().forEach(t=>t.stop());ring.current??=new AudioContext();await ring.current.resume();remember(connection,true);
 }
 async function reloadSettings(connection=selectedConnection.current){const value=await api(connection,'/calls/settings');if(live.current&&selectedConnection.current===connection)setSettings(value);return value;}
 useEffect(()=>{setSettings(null);setOnline(remembered(user,connectionId));if(enabled)reloadSettings(connectionId).catch(e=>{if(live.current&&selectedConnection.current===connectionId)setError(e.message);});},[connectionId,enabled]);
 useEffect(()=>{
  live.current=true;
  if(!enabled)return;
  async function poll(){
   if(pollBusy.current||!live.current)return;pollBusy.current=true;const expected=current.current,wasBusy=busyRef.current;
   try{
    const results=await Promise.all(connectionsRef.current.map(async c=>{try{return {connection:c.id,items:(await api(c.id,'/calls?clientId='+clientId)).map(row=>({...row,connectionId:c.id,connectionName:c.name}))};}catch(e){return {connection:c.id,error:e};}}));
    if(!live.current)return;
    const items=results.flatMap(r=>r.items||[]);setCalls(items);
    const mine=expected&&items.find(c=>c.id===expected.id&&c.connectionId===expected.connectionId);
    if(mine&&current.current?.id===expected.id){
     if(terminal.has(mine.state)){release();setCurrent(null);setNotice('Ligação encerrada.');}
     else{setActive(mine);await api(mine.connectionId,'/calls/'+mine.id+'/heartbeat',{clientId});if(mine.direction==='BUSINESS_INITIATED'&&mine.session?.sdp_type==='answer'&&peer.current&&!answerApplied.current){answerApplied.current=true;try{await peer.current.setRemoteDescription({type:'answer',sdp:mine.session.sdp});}catch(e){answerApplied.current=false;throw e;}}}
    }else if(expected&&current.current?.id===expected.id&&!wasBusy&&!busyRef.current&&results.some(r=>r.connection===expected.connectionId&&r.items)){
     release();setCurrent(null);setNotice('Esta ligação não está mais disponível para seu usuário.');
    }
    for(const call of items.filter(c=>c.direction==='USER_INITIATED'&&c.state==='ringing'&&!c.operatorName)){
     const key=call.connectionId+':'+call.id;
     if(remembered(user,call.connectionId)&&ring.current&&!ringed.current.has(key)){ringed.current.add(key);await ring.current.resume();const oscillator=ring.current.createOscillator(),gain=ring.current.createGain();oscillator.frequency.value=660;gain.gain.value=.08;oscillator.connect(gain);gain.connect(ring.current.destination);oscillator.start();oscillator.stop(ring.current.currentTime+.5);}
    }
    const failed=results.find(r=>r.error&&![401,403,404].includes(r.error.status));if(failed)setError('Não foi possível atualizar as ligações de uma conexão. Tentaremos novamente.');
   }catch(e){if(live.current)setError(microphoneError(e));}finally{pollBusy.current=false;}
  }
  poll();const timer=setInterval(poll,1000),unload=()=>release();window.addEventListener('pagehide',unload);
  return()=>{live.current=false;clearInterval(timer);window.removeEventListener('pagehide',unload);disconnect();ring.current?.close();ring.current=null;};
 },[enabled,user.id]);
 useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),7000);return()=>clearTimeout(timer);},[notice]);
 function run(fn){if(busyRef.current)return;busyRef.current=true;setBusy(true);setError('');setNotice('');Promise.resolve().then(fn).catch(e=>{if(live.current)setError(microphoneError(e));}).finally(()=>{busyRef.current=false;if(live.current)setBusy(false);});}
 async function makePeer(connection){
  if(peer.current)throw new Error('Encerre sua ligação atual antes de iniciar outra.');
  const connectionSettings=await reloadSettings(connection);
  const media=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:false});
  if(!live.current){media.getTracks().forEach(t=>t.stop());throw new Error('Atendimento encerrado.');}
  remember(connection,true);stream.current=media;const pc=new RTCPeerConnection({iceServers:connectionSettings.iceServers||[]});peer.current=pc;setMuted(false);media.getTracks().forEach(t=>pc.addTrack(t,media));
  pc.ontrack=e=>{if(audio.current){audio.current.srcObject=e.streams[0]||new MediaStream([e.track]);audio.current.play().catch(()=>setError('Clique em Ouvir ligação para liberar o áudio do navegador.'));}};
  pc.onconnectionstatechange=()=>{if(pc.connectionState==='failed'){setError('A conexão de áudio falhou. Confira sua rede.');disconnect();}};
  return pc;
 }
 async function localSession(pc,description){
  await pc.setLocalDescription(description);
  if(pc.iceGatheringState!=='complete')await new Promise((resolve,reject)=>{const timeout=setTimeout(()=>{pc.removeEventListener('icegatheringstatechange',check);reject(new Error('A rede não concluiu a conexão de áudio. Verifique o firewall ou a configuração TURN.'));},12000);function check(){if(pc.iceGatheringState==='complete'){clearTimeout(timeout);pc.removeEventListener('icegatheringstatechange',check);resolve();}}pc.addEventListener('icegatheringstatechange',check);check();});
  return {sdp_type:pc.localDescription.type,sdp:pc.localDescription.sdp};
 }
 async function start(contact,connection){
  if(current.current)return;
  const target={phone:contact.telefone,name:contact.nome||contact.nomeWhatsApp||contact.telefone,connectionId:connection};
  try{
   const permission=await api(connection,'/calls/permission?phone='+encodeURIComponent(target.phone));
   if(!permission.actions?.some(a=>a.action_name==='start_call'&&a.can_perform_action)){setPermissionTarget(target);return;}
   const pc=await makePeer(connection),session=await localSession(pc,await pc.createOffer()),id=crypto.randomUUID();setCurrent({id,connectionId:connection,phone:target.phone,contactName:target.name,state:'starting'});
   try{const row=await api(connection,'/calls/start',{phone:target.phone,clientId,requestId:id,session});if(live.current)setActive({...row,connectionId:connection});}
   catch(e){if(e.status&&e.status<500){release();setCurrent(null);}throw e;}
  }catch(e){if(!current.current)release();throw e;}
 }
 async function answer(row){
  if(current.current)return;
  try{const pc=await makePeer(row.connectionId),claimed=await api(row.connectionId,'/calls/'+row.id+'/claim',{clientId});setCurrent({...claimed,connectionId:row.connectionId,connectionName:row.connectionName});if(claimed.session?.sdp_type!=='offer')throw new Error('A oferta de áudio não está disponível.');await pc.setRemoteDescription({type:'offer',sdp:claimed.session.sdp});const session=await localSession(pc,await pc.createAnswer());const accepted=await api(row.connectionId,'/calls/'+row.id+'/accept',{clientId,session});if(live.current)setActive({...accepted,connectionId:row.connectionId,connectionName:row.connectionName});}
  catch(e){await disconnect();throw e;}
 }
 async function reject(row){const claimed=await api(row.connectionId,'/calls/'+row.id+'/claim',{clientId});setCurrent({...claimed,connectionId:row.connectionId});await api(row.connectionId,'/calls/'+row.id+'/reject',{clientId});setCurrent(null);}
 const incoming=calls.filter(c=>c.direction==='USER_INITIATED'&&c.state==='ringing'&&!c.operatorName),locked=!!active;
 const value={settings,online,busy,locked,calls:calls.filter(c=>c.connectionId===connectionId),user,run,error,setError,prepare:()=>prepare(connectionId),unavailable:()=>remember(connectionId,false),start:contact=>run(()=>start(contact,connectionId)),configure:()=>run(async()=>{const enabled=settings?.visibility!=='DEFAULT'||settings?.status!=='ENABLED';const value=await api(connectionId,'/calls/settings',{enabled});if(live.current&&selectedConnection.current===connectionId)setSettings(value);setNotice(enabled?'Ligações habilitadas nesta conexão.':'Ligações desativadas nesta conexão.');}),reloadSettings};
 return <CallingContext.Provider value={value}>{children}{enabled&&<aside className="call-notifications" aria-label="Avisos de ligações">
  {permissionTarget&&<section className="call-notification call-consent" role="dialog" aria-label="Autorização para ligar"><strong>Autorização para ligar</strong><p>Enviar uma solicitação pelo WhatsApp para <b>{permissionTarget.name}</b>?</p><div className="call-card-actions"><button disabled={busy} onClick={()=>run(async()=>{const target=permissionTarget;await api(target.connectionId,'/calls/permission',{phone:target.phone});setPermissionTarget(null);setNotice('Solicitação enviada. Aguarde a autorização e clique em Ligar novamente.');})}>Enviar solicitação de autorização</button><button className="secondary" disabled={busy} onClick={()=>setPermissionTarget(null)}>Cancelar</button></div></section>}
  {incoming.map(row=><section className="call-notification call-incoming" role="alert" key={row.connectionId+row.id}><div className="call-card-heading"><PhoneIncoming size={21}/><div><strong>Ligação recebida</strong><p>{row.contactName||'+'+row.phone}</p><small>{row.connectionName}</small></div></div><div className="call-card-actions"><button disabled={busy||locked} onClick={()=>run(()=>answer(row))}>Atender</button><button className="secondary" disabled={busy||locked} onClick={()=>run(()=>reject(row))}>Recusar</button></div></section>)}
  {active&&<section className="call-notification call-active" role="status"><strong>{labels[active.state]||'Conectando'}</strong><p>{active.contactName||'+'+active.phone}</p>{active.connectionName&&<small>{active.connectionName}</small>}<div className="call-card-actions"><button className="secondary" disabled={!stream.current} onClick={()=>{const value=!muted;stream.current?.getAudioTracks().forEach(t=>t.enabled=!value);setMuted(value);}}>{muted?<MicOff size={16}/>:<Mic size={16}/>} {muted?'Ativar microfone':'Silenciar'}</button><button className="secondary" onClick={()=>audio.current?.play().then(()=>setError('')).catch(()=>setError('O navegador está bloqueando o áudio.'))}>Ouvir ligação</button><button className="call-hangup" disabled={busy} onClick={()=>run(async()=>{const call=current.current,result=await api(call.connectionId,'/calls/'+call.id+'/terminate',{clientId});release();setCurrent(null);setNotice(result.state==='cancel_pending'?'Encerramento solicitado. Aguarde a confirmação da Meta.':'Ligação encerrada.');})}><PhoneOff size={16}/>Encerrar</button></div></section>}
  {error&&<section className="call-notification call-error" role="alert"><p>{error}</p><button className="secondary" aria-label="Fechar aviso de ligação" onClick={()=>setError('')}><X size={16}/></button></section>}{notice&&<section className="call-notification call-notice" role="status">{notice}<button className="secondary" aria-label="Fechar confirmação de ligação" onClick={()=>setNotice('')}><X size={16}/></button></section>}
 </aside>}<audio ref={audio} autoPlay/></CallingContext.Provider>;
}
export function CallButton({lead}){
 const calling=useContext(CallingContext);if(!calling||!can(calling.user,'calls.use'))return null;
 return <button className="secondary conversation-call-button" aria-label={'Ligar para '+(lead.nome||lead.nomeWhatsApp||lead.telefone)} title={calling.settings?.status==='ENABLED'?'Ligar pelo WhatsApp':'Habilite as ligações nas configurações desta conexão'} disabled={calling.busy||calling.locked||calling.settings?.status!=='ENABLED'||lead.optedOut} onClick={()=>calling.start(lead)}><Phone size={16}/><span>Ligar</span></button>;
}
export function CallingSettings({connectionName}){
 const calling=useContext(CallingContext);if(!calling)return null;const {settings,online,busy,locked,user,run}=calling;
 return <section className="panel settings-panel connection-calling-settings" aria-label="Ligações da conexão"><h2>Ligações de {connectionName||'esta conexão'}</h2><p className="muted">Chamadas recebidas aparecem em um aviso na plataforma. Contatos atribuídos são visíveis somente ao responsável e administradores; contatos sem responsável aparecem para toda a equipe autorizada.</p><h3>Configuração geral do número</h3><p>{settings?.status==='ENABLED'?'Ligações habilitadas':'Ligações desativadas ou não configuradas'}</p>{user.role==='admin'?<button className="secondary" disabled={busy||locked||!settings} onClick={calling.configure}>{settings?.visibility==='DEFAULT'&&settings?.status==='ENABLED'?'Desativar chamadas do número':'Habilitar recebimento no WhatsApp'}</button>:<p className="muted">A habilitação do número é gerenciada pelo administrador.</p>}<h3>Atendimento neste navegador</h3><p>{online?'Microfone preparado e avisos sonoros ativados.':'Prepare o microfone e o som para atender neste navegador.'}</p>{!online?<button className="secondary" disabled={busy||locked||settings?.status!=='ENABLED'} onClick={()=>run(calling.prepare)}>Ativar atendimento de ligações</button>:<button className="secondary" disabled={busy||locked} onClick={calling.unavailable}>Desativar avisos sonoros neste navegador</button>}<p className="muted">Mantenha a plataforma aberta. Você também pode permitir o microfone ao clicar em Atender ou Ligar. O navegador pode exigir uma interação para reproduzir o toque.</p><details><summary>Últimas ligações desta conexão</summary><ul className="calling-history">{calling.calls.slice(0,10).map(c=><li key={c.id}><span>{c.contactName||'+'+c.phone}</span><span>{labels[c.state]||c.state}{c.operatorName?' · '+c.operatorName:''}</span></li>)}{!calling.calls.length&&<li>Nenhuma ligação registrada.</li>}</ul></details></section>;
}
