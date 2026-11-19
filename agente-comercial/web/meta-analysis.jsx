import React,{useEffect,useRef,useState} from 'react';
import {ImagePlus,Send,Sparkles,X} from 'lucide-react';
import {request} from './account.jsx';
import {dateLabel} from './meta-quality.jsx';
import './meta-analysis.css';

const prompts=[
  'Quais campanhas você recomenda manter, ajustar ou pausar? Explique por campanha.',
  'Onde o funil mais perde contatos e quais ações você sugere?',
  'Quais campanhas tiveram vendas confirmadas e o que já dá para concluir?'
];

export function MetaAnalysisChat({filters,onClose}) {
  const dialog=useRef(null), bottom=useRef(null), running=useRef(false), fileInput=useRef(null);
  const [messages,setMessages]=useState([]),[draft,setDraft]=useState(''),[pending,setPending]=useState('');
  const [error,setError]=useState(''),[partial,setPartial]=useState(false);
  const [image,setImage]=useState(null),[reading,setReading]=useState(false);
  useEffect(()=>{dialog.current.showModal();},[]);
  useEffect(()=>{bottom.current?.scrollIntoView({block:'nearest'});},[messages,pending]);

  function attach(event) {
    const file=event.target.files[0];
    event.target.value='';
    if (!file) return;
    setError('');
    if (!['image/jpeg','image/png','image/gif','image/webp'].includes(file.type)||file.size>2*1024*1024) {
      setError('Anexe uma imagem JPG, PNG, GIF ou WebP de até 2 MB.');
      return;
    }
    setReading(true);
    const reader=new FileReader();
    reader.onload=()=>setImage({name:file.name,url:reader.result});
    reader.onerror=()=>setError('Não foi possível ler a imagem. Selecione o arquivo novamente.');
    reader.onloadend=()=>setReading(false);
    reader.readAsDataURL(file);
  }

  async function submit(value) {
    const question=value.trim()||(image?'Analise a imagem anexada e relacione os dados visíveis com as campanhas.':'');
    if (!question||running.current||reading) return;
    running.current=true;
    setPending(question);
    setError('');
    setDraft('');
    const history=[...messages,{role:'user',text:question}];
    try {
      const answer=await request('/meta-ads/analysis',{from:filters.from,to:filters.to,connections:filters.ids,messages:history.slice(-9),image:image?.url});
      setMessages([...messages,{role:'user',text:question,attachment:image?.name},{role:'assistant',text:answer.text,model:answer.model}]);
      setPartial(!answer.settingsComplete);
      setImage(null);
    } catch(e) {
      setDraft(question);
      const message=typeof e.message==='string'?e.message.trim():'';
      const gatewayFailure=e.status>=500 || !e.status || /<\s*(?:!doctype|html|head|body)\b/i.test(message);
      setError(gatewayFailure||!message||message.length>250
        ? 'A análise está temporariamente indisponível. Sua pergunta foi mantida. Tente enviar novamente.'
        : message);
    } finally {
      running.current=false;
      setPending('');
    }
  }

  return <dialog ref={dialog} className="meta-analysis-dialog" aria-labelledby="meta-analysis-title" onClose={onClose}>
    <header className="meta-analysis-header">
      <div><h2 id="meta-analysis-title"><Sparkles size={21}/> Analisar campanhas com IA</h2><p>{dateLabel(filters.from)} a {dateLabel(filters.to)} · Conexões do painel</p></div>
      <button type="button" className="secondary icon-button" aria-label="Fechar análise" onClick={()=>dialog.current.close()}><X size={20}/></button>
    </header>
    <div className="meta-analysis-log" role="log">
      {!messages.length&&!pending&&<div className="meta-analysis-prompts">
        <p>Use os indicadores da Meta e os fechamentos do CRM para decidir o que manter, ajustar ou pausar.</p>
        {prompts.map(prompt=><button type="button" className="secondary" key={prompt} onClick={()=>submit(prompt)}>{prompt}</button>)}
      </div>}
      {messages.map((item,i)=><article key={i} className={'meta-analysis-message '+item.role}>
        <strong>{item.role==='user'?'Você':item.model==='deepseek-v4-pro'?'DeepSeek V4 Pro':item.model==='deepseek-flash'?'DeepSeek Flash · Imagem':'Análise da IA'}</strong><div>{item.text}</div>
        {item.attachment&&<small>Imagem: {item.attachment}</small>}
      </article>)}
      {pending&&<><article className="meta-analysis-message user"><strong>Você</strong><div>{pending}</div></article><p role="status">Consultando campanhas e preparando a análise…</p></>}
      {partial&&!pending&&<p className="muted">A Meta retornou informações parciais sobre o status ou orçamento das campanhas.</p>}
      <div ref={bottom}/>
    </div>
    <form className="meta-analysis-form" onSubmit={e=>{e.preventDefault();submit(draft);}}>
      {error&&<p role="alert" className="q-alert">{error}</p>}
      <label htmlFor="meta-analysis-question">Sua pergunta</label>
      {image&&<div className="meta-analysis-attachment"><span>{image.name}</span><button type="button" className="secondary icon-button" aria-label="Remover imagem" disabled={!!pending||reading} onClick={()=>setImage(null)}><X size={15}/></button></div>}
      <input type="file" hidden ref={fileInput} accept="image/jpeg,image/png,image/gif,image/webp" onChange={attach}/>
      <div><textarea id="meta-analysis-question" value={draft} onChange={e=>setDraft(e.target.value)} disabled={!!pending} rows={2} maxLength={1500} placeholder="Ex.: Qual campanha devo priorizar com o orçamento atual?"/>
        <button type="button" className="secondary icon-button" aria-label="Anexar imagem" title="Anexar imagem de até 2 MB" disabled={!!pending||reading} onClick={()=>fileInput.current.click()}><ImagePlus size={20}/></button>
        <button type="submit" disabled={!!pending||reading||(!draft.trim()&&!image)}><Send size={17}/> Enviar</button></div>
    </form>
  </dialog>;
}
