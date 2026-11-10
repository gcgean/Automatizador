import React,{useState} from 'react';
import {Tag,Plus,X,UserRound} from 'lucide-react';
import {request} from './account.jsx';
import {scoped} from './manage.jsx';
import './tags.css';
const colors=[['green','Verde'],['blue','Azul'],['purple','Roxo'],['pink','Rosa'],['yellow','Amarelo'],['orange','Laranja'],['red','Vermelho'],['gray','Cinza']];
export function AssignmentBadge({lead,user}){
 if(!lead.assignedUserId)return null;
 const mine=lead.assignedUserId===user?.id,name=lead.assignedUserName||'Atendente responsável';
 return <span className={'assignment-badge '+(mine?'mine':'')} aria-label={'Responsável pelo atendimento: '+name} title={'Atendimento exclusivo de '+name+' e administradores'}><UserRound size={12}/>{mine?'Com você · ':'Com '}{name}</span>;
}
export function TagChips({tags=[],limit=10}){
 return <>{tags.slice(0,limit).map(tag=><span key={tag.id} className={'contact-label label-'+tag.color} title={'Etiqueta: '+tag.name}><Tag size={10}/>{tag.name}</span>)}{tags.length>limit&&<span className="contact-label label-gray" title={tags.slice(limit).map(t=>t.name).join(', ')}>+{tags.length-limit}</span>}</>;
}
export function TagEditor({lead,tags=[],connectionId,allowed,action,busy}){
 const [open,setOpen]=useState(false),[name,setName]=useState(''),[color,setColor]=useState('green'),[creating,setCreating]=useState(false),[error,setError]=useState('');
 const selected=lead.tags||[],ids=selected.map(t=>t.id);
 async function create(event){event.preventDefault();if(creating)return;setCreating(true);setError('');try{const tag=await request(scoped('/tags',connectionId),{name,color});if(await action('/leads/'+lead.telefone+'/tags',{tagIds:[...ids,tag.id]},'Etiqueta criada e adicionada.'))setName('');}catch(e){setError(e.message);}finally{setCreating(false);}}
 return <div className="tag-section"><div className="tag-summary"><div className="tag-chips"><TagChips tags={selected}/>{!selected.length&&<span className="muted tag-empty">Sem etiquetas</span>}</div>{allowed&&<button type="button" className="secondary tag-toggle" aria-label="Editar etiquetas" aria-expanded={open} onClick={()=>setOpen(!open)}><Tag size={14}/>Etiquetas{open?<X size={13}/>:<Plus size={13}/>}</button>}</div>
  {open&&<div className="tag-editor"><strong>Etiquetas do atendimento</strong><p className="muted">Selecione até 10 etiquetas. Elas aparecem também na lista de conversas.</p><div className="tag-options">{tags.map(tag=><label key={tag.id}><input type="checkbox" checked={ids.includes(tag.id)} disabled={busy||creating||ids.length>=10&&!ids.includes(tag.id)} onChange={e=>action('/leads/'+lead.telefone+'/tags',{tagIds:e.target.checked?[...ids,tag.id]:ids.filter(id=>id!==tag.id)},'Etiquetas atualizadas.')}/><TagChips tags={[tag]}/></label>)}{!tags.length&&<p className="muted">Crie a primeira etiqueta desta conexão.</p>}</div><form onSubmit={create} className="tag-create"><label>Nova etiqueta<input aria-label="Nome da etiqueta" placeholder="Ex.: Retornar amanhã" value={name} maxLength={40} required onChange={e=>setName(e.target.value)}/></label><label>Cor<select aria-label="Cor da etiqueta" value={color} onChange={e=>setColor(e.target.value)}>{colors.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label><button type="submit" disabled={busy||creating||!name.trim()||ids.length>=10}><Plus size={14}/>{creating?'Criando…':'Criar e adicionar'}</button></form>{error&&<p role="alert" className="error">{error}</p>}</div>}
 </div>;
}
