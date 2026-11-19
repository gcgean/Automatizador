import React,{useEffect,useRef,useState} from 'react';
export function SuggestionAudio({onUse}){
 const [state,setState]=useState('idle'),[seconds,setSeconds]=useState(0),[file,setFile]=useState(null),[url,setUrl]=useState(''),[error,setError]=useState('');
 const recorder=useRef(null),stream=useRef(null),alive=useRef(true),timer=useRef(null),started=useRef(0);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;clearInterval(timer.current);if(recorder.current){recorder.current.onstop=null;if(recorder.current.state!=='inactive')recorder.current.stop();}stream.current?.getTracks().forEach(t=>t.stop());};},[]);
 useEffect(()=>{if(!file){setUrl('');return;}const u=URL.createObjectURL(file);setUrl(u);return()=>URL.revokeObjectURL(u);},[file]);
 async function start(){
  setError('');setState('permission');
  try{if(!navigator.mediaDevices?.getUserMedia||!globalThis.MediaRecorder)throw Error('Seu navegador não permite gravação. Use a opção de anexar áudio na conversa.');
   const s=await navigator.mediaDevices.getUserMedia({audio:true});if(!alive.current){s.getTracks().forEach(t=>t.stop());return;}stream.current=s;
   const mime=['audio/webm;codecs=opus','audio/mp4','audio/webm'].find(t=>MediaRecorder.isTypeSupported(t));const r=new MediaRecorder(s,mime?{mimeType:mime}:{}),chunks=[];recorder.current=r;
   r.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
   r.onstop=()=>{clearInterval(timer.current);s.getTracks().forEach(t=>t.stop());if(!alive.current)return;setState('idle');const type=r.mimeType.split(';')[0]||'audio/webm',blob=new Blob(chunks,{type});if(blob.size<512||Date.now()-started.current<1000){setError('Gravação curta demais. Grave novamente por pelo menos um segundo.');return;}setFile(new File([blob],'resposta-'+Date.now()+'.'+(type==='audio/mp4'?'m4a':'webm'),{type}));};
   r.onerror=()=>{setError('Não foi possível gravar. Tente novamente.');if(r.state!=='inactive')r.stop();s.getTracks().forEach(t=>t.stop());clearInterval(timer.current);setState('idle');};
   r.start(250);setFile(null);started.current=Date.now();setSeconds(0);setState('recording');timer.current=setInterval(()=>{const elapsed=Math.floor((Date.now()-started.current)/1000);setSeconds(elapsed);if(elapsed>=600&&r.state==='recording')r.stop();},500);
  }catch(e){stream.current?.getTracks().forEach(t=>t.stop());if(alive.current){setState('idle');setError(e.name==='NotAllowedError'?'Permita o acesso ao microfone no navegador para gravar.':e.message||'Não foi possível acessar o microfone.');}}
 }
 return <section style={{borderTop:'1px solid #cad7e5',marginTop:14,paddingTop:12}} aria-label="Gravar resposta em áudio"><p>Leia a sugestão acima com sua própria voz. Depois, ouça antes de usar.</p>{error&&<p role="alert" className="error">{error}</p>}{state==='recording'?<><p role="status">Gravando · {Math.floor(seconds/60)}:{String(seconds%60).padStart(2,'0')} (máximo 10 minutos)</p><button type="button" onClick={()=>recorder.current?.stop()}>Parar e ouvir</button></>:<button type="button" className="secondary" disabled={state==='permission'} onClick={start}>{state==='permission'?'Aguardando microfone…':file?'Gravar novamente':'Gravar áudio lendo a sugestão'}</button>}{url&&state==='idle'&&<div style={{display:'grid',gap:10,marginTop:10}}><audio controls src={url} aria-label="Ouvir resposta gravada"/><button type="button" onClick={()=>onUse(file)}>Usar áudio</button><small>O áudio irá para a prévia da conversa. Confirme o envio lá.</small></div>}</section>;
}
