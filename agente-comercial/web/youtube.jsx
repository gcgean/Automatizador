import React,{useEffect,useState} from 'react';
import {ExternalLink,Send,X} from 'lucide-react';
import {request} from './account.jsx';
import './youtube.css';

const scopedPath=(path,connection)=>path+(path.includes('?')?'&':'?')+'connection='+encodeURIComponent(connection);

// Campos da conexão do YouTube (credenciais do Google, link do WhatsApp e modo de resposta).
export function YouTubeFields({form,field}){
 const redirect=(typeof location!=='undefined'?location.origin:'')+'/youtube/callback';
 return <>
  <label>ID do cliente Google<input value={form.appId||''} onChange={e=>field('appId',e.target.value)} placeholder="....apps.googleusercontent.com" autoComplete="off" required/></label>
  <label>Chave secreta do cliente Google<input type="password" autoComplete="new-password" value={form.appSecret||''} onChange={e=>field('appSecret',e.target.value)} placeholder={form.customSecret?'Salva. Em branco mantém a atual.':''} required={!form.customSecret}/></label>
  <label>Link do WhatsApp para os interessados<input value={form.youtubeLink||''} onChange={e=>field('youtubeLink',e.target.value)} placeholder="Em branco usa o WhatsApp ativo da empresa (https://wa.me/55...)" inputMode="url"/></label>
  <label className="youtube-auto"><input type="checkbox" checked={!!form.youtubeAuto} onChange={e=>field('youtubeAuto',e.target.checked)}/><span>Publicar as respostas da HELENA sem aprovação</span></label>
  <p className="muted youtube-help">A plataforma lê os comentários novos dos vídeos do canal a cada 5 minutos. A HELENA separa quem demonstrou interesse e prepara uma resposta curta convidando para o WhatsApp; elogios, spam e ofensas não viram atendimento. As respostas são públicas no vídeo. No Google Cloud, ative a "YouTube Data API v3", crie um "ID do cliente OAuth" do tipo aplicativo da Web com o endereço de retorno <code>{redirect}</code> e deixe a tela de consentimento "Em produção" (em teste, o acesso expira em 7 dias).</p>
  {form.youtubeError&&<p className="youtube-error" role="status">Última leitura do canal falhou: {form.youtubeError}</p>}
 </>;
}

// Abre a autorização do Google numa aba nova (aberta já no clique para o navegador não bloquear).
export function YouTubeConnectButton({id,connected,busy,run,setNotice}){
 return <button type="button" className="secondary" disabled={busy} onClick={()=>{const tab=window.open('about:blank','_blank');run(async()=>{try{const {url}=await request('/connections/'+id+'/youtube',{});if(tab)tab.location.href=url;else window.location.href=url;setNotice('Conclua a autorização na aba do Google com a conta dona do canal. Depois volte e atualize esta tela.');}catch(error){tab?.close();throw error;}});}}>{connected?'Reconectar com o Google':'Conectar com o Google'}</button>;
}

// Comentários do contato aguardando resposta: a sugestão da HELENA pode ser editada antes de publicar.
export function YouTubePanel({connectionId,lead,events,enabled}){
 const [items,setItems]=useState([]),[drafts,setDrafts]=useState({}),[busy,setBusy]=useState(''),[error,setError]=useState('');
 useEffect(()=>{let alive=true;request(scopedPath('/leads/'+lead.telefone+'/youtube',connectionId)).then(data=>{if(alive){setItems(data.items||[]);setError('');}}).catch(e=>{if(alive)setError(e.message);});return()=>{alive=false;};},[connectionId,lead.telefone,events.length]);
 async function act(item,kind){
  setBusy(item.threadId+kind);setError('');
  try{const next=await request(scopedPath('/leads/'+lead.telefone+'/youtube/'+item.threadId+'/'+kind,connectionId),kind==='reply'?{text:drafts[item.threadId]??item.suggestion}:{});setItems(next.items||[]);}
  catch(e){setError(e.message);}finally{setBusy('');}
 }
 return <div className="youtube-panel" aria-label="Comentários do YouTube">
  {items.map(item=><div className="youtube-item" key={item.threadId}>
   <div className="youtube-item-head"><span>Comentário em {item.videoUrl?<a href={item.videoUrl} target="_blank" rel="noreferrer">{item.videoTitle||'vídeo'} <ExternalLink size={11}/></a>:(item.videoTitle||'vídeo')}</span>{item.error&&<strong className="youtube-error">Falhou: {item.error}</strong>}</div>
   <blockquote>{item.text}</blockquote>
   {enabled?<><label className="youtube-label" htmlFor={'yt-'+item.threadId}>Resposta pública sugerida pela HELENA</label><textarea id={'yt-'+item.threadId} rows={3} maxLength={2000} value={drafts[item.threadId]??item.suggestion} onChange={e=>setDrafts({...drafts,[item.threadId]:e.target.value})}/>
    <div className="youtube-actions"><button type="button" className="secondary" disabled={!!busy} onClick={()=>act(item,'discard')}><X size={14}/>Descartar</button><button type="button" disabled={!!busy||!(drafts[item.threadId]??item.suggestion).trim()} onClick={()=>act(item,'reply')}><Send size={14}/>{busy===item.threadId+'reply'?'Publicando…':'Publicar resposta'}</button></div></>
   :<p className="muted">Resposta sugerida: {item.suggestion}</p>}
  </div>)}
  {error&&<p className="youtube-error" role="alert">{error}</p>}
  <p className="youtube-note">YouTube: o que você enviar aqui vira uma resposta pública no comentário mais recente deste contato.</p>
 </div>;
}
