import React,{useState} from 'react';
import {scoped} from './manage.jsx';
export function ContactAvatar({lead,connectionId,large=false}){
 const name=lead.nome||lead.nomeWhatsApp||lead.telefone||'Contato';
 const initials=name.trim().split(/\s+/).slice(0,2).map(s=>s[0]).join('').toUpperCase();
 return <span className={'contact-avatar'+(large?' large':'')} aria-hidden="true">{lead.avatarAttachmentId?<img src={scoped('/media/'+lead.avatarAttachmentId,connectionId)} alt=""/>:<span>{initials}</span>}</span>;
}
export function AvatarSettings({lead,connectionId,action,base,readOnly}){
 const [busy,setBusy]=useState(false),[error,setError]=useState('');
 async function upload(file){if(!file)return;setBusy(true);setError('');try{if(!['image/jpeg','image/png'].includes(file.type)||file.size>5*1024*1024)throw Error('Escolha uma foto JPG ou PNG de até 5 MB.');const response=await fetch(scoped(base+'/avatar-upload',connectionId),{method:'POST',headers:{'Content-Type':file.type,'X-Requested-With':'CommandPanel','X-Media-Meta':encodeURIComponent(JSON.stringify({mime:file.type,name:file.name,caption:'',requestId:crypto.randomUUID()}))},body:file});if(!response.ok)throw Error(await response.text());const data=await response.json();await action(base+'/avatar',{attachmentId:data.id},'Foto do contato atualizada.');}catch(e){setError(e.message);}finally{setBusy(false);}}
 return <section className="avatar-settings"><ContactAvatar lead={lead} connectionId={connectionId} large/><div><strong>Foto do contato</strong><p className="muted">A foto do WhatsApp não é importada por esta integração. Escolha uma foto para este painel; sem cadastro, mostramos as iniciais.</p>{!readOnly&&<><label className="file-select">{busy?'Salvando…':'Escolher foto'}<input type="file" aria-label="Foto do contato" accept="image/jpeg,image/png" disabled={busy} onChange={e=>{upload(e.target.files?.[0]);e.target.value='';}}/></label>{lead.avatarAttachmentId&&<button className="secondary" disabled={busy} onClick={()=>action(base+'/avatar',{attachmentId:null},'Foto removida.')}>Remover foto</button>}</>}{error&&<p role="alert" className="error">{error}</p>}</div></section>;
}
