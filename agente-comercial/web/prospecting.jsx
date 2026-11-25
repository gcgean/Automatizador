import React,{useEffect,useMemo,useState} from 'react';
import {Upload,Filter,Megaphone,KeyRound,Copy,Check,Plus,Pause,Play,Eye,X,CheckCircle2,XCircle,Users,MapPin,Briefcase,Building2} from 'lucide-react';
import {request} from './account.jsx';
import {scoped} from './manage.jsx';
import {can} from '../shared/access.js';
import './prospecting.css';

const STATUS={new:['Novo','info'],reserved:['Em lote','warn'],approved:['Aprovado','ok'],sent:['Enviado','ok'],replied:['Respondeu','ok'],qualified:['Qualificado','ok'],discarded:['Descartado','off'],optout:['Descadastrado','off'],existing:['Já é contato','off']};
const SKIP={so_fixo:'Só telefone fixo (sem WhatsApp)',invalido:'Telefone inválido',sem_telefone:'Sem telefone',duplicado_no_arquivo:'Repetido no arquivo',ja_e_contato:'Já é contato da empresa',descadastrado:'Pediu para não receber'};
const fmt=n=>Number(n||0).toLocaleString('pt-BR');
const when=v=>v?new Date(v).toLocaleString('pt-BR',{dateStyle:'short',timeStyle:'short'}):'—';
async function readFileText(file){const buf=await file.arrayBuffer();let text=new TextDecoder('utf-8').decode(buf);if(text.includes('�'))text=new TextDecoder('windows-1252').decode(buf);return text;}

function Badge({status}){const [label,cls]=STATUS[status]||[status,'off'];return <span className={'pr-badge '+cls}>{label}</span>;}
function FacetSelect({label,value,options,onChange}){return <label className="pr-field"><span>{label}</span><select value={value} onChange={e=>onChange(e.target.value)}><option value="">Todos</option>{options.map(o=><option key={o.value} value={o.value}>{o.value} ({fmt(o.n)})</option>)}</select></label>;}
function Bars({title,icon:Icon,rows}){const max=Math.max(1,...rows.map(r=>r.n));return <div className="pr-bars"><h4><Icon size={15}/> {title}</h4>{rows.length?rows.slice(0,6).map(r=><div key={r.value} className="pr-bar"><span title={r.value}>{r.value}</span><div><i style={{width:Math.max(4,r.n/max*100)+'%'}}/></div><b>{fmt(r.n)}</b></div>):<p className="muted">Sem dados ainda.</p>}</div>;}

function Base({user,summary,filters,setFilters,reload,busy,run}){
 const [rows,setRows]=useState([]),[result,setResult]=useState(null),[file,setFile]=useState(null);
 useEffect(()=>{request('/prospecting/prospects?'+new URLSearchParams({...filters,limit:50})).then(setRows).catch(()=>setRows([]));},[JSON.stringify(filters),summary?.total]);
 const f=summary?.facets||{uf:[],city:[],segment:[],size:[]};
 return <>
  {can(user,'prospecting.manage')&&<section className="pr-card">
   <div className="pr-card-head"><Upload size={18}/><div><h3>Importar planilha da Casa dos Dados</h3><p className="muted">Exporte a lista em CSV com os telefones. Só celulares entram; fixos, repetidos e quem já é contato ficam de fora.</p></div></div>
   <form className="pr-row" onSubmit={e=>{e.preventDefault();if(!file)return;run(async()=>{const csv=await readFileText(file);const r=await request('/prospecting/import',{csv,fileName:file.name});setResult(r);setFile(null);e.target.reset();await reload();});}}>
    <input type="file" accept=".csv,text/csv" onChange={e=>setFile(e.target.files?.[0]||null)}/><button disabled={busy||!file}>{busy?'Importando…':'Importar'}</button>
   </form>
   {result&&<div className="pr-result"><strong>{fmt(result.created)} novos · {fmt(result.updated)} atualizados</strong> de {fmt(result.received)} linhas.{Object.keys(result.skipped||{}).length>0&&<ul>{Object.entries(result.skipped).map(([k,n])=><li key={k}>{SKIP[k]||k}: {fmt(n)}</li>)}</ul>}<small className="muted">Telefone lido de: {result.phoneColumns?.join(', ')||'—'}</small></div>}
  </section>}
  <section className="pr-grid3">
   <Bars title="Cidades" icon={MapPin} rows={f.city}/><Bars title="Segmentos" icon={Briefcase} rows={f.segment}/><Bars title="Porte" icon={Building2} rows={f.size}/>
  </section>
  <section className="pr-card">
   <div className="pr-card-head"><Filter size={18}/><div><h3>Base de contatos</h3><p className="muted">{fmt(summary?.filtered)} contatos com este filtro.</p></div></div>
   <div className="pr-filters">
    <FacetSelect label="UF" value={filters.uf||''} options={f.uf} onChange={v=>setFilters({...filters,uf:v,city:''})}/>
    <FacetSelect label="Cidade" value={filters.city||''} options={f.city} onChange={v=>setFilters({...filters,city:v})}/>
    <FacetSelect label="Segmento" value={filters.segment||''} options={f.segment} onChange={v=>setFilters({...filters,segment:v})}/>
    <FacetSelect label="Porte" value={filters.size||''} options={f.size} onChange={v=>setFilters({...filters,size:v})}/>
    <label className="pr-field"><span>Situação</span><select value={filters.status||''} onChange={e=>setFilters({...filters,status:e.target.value})}><option value="">Todas</option>{Object.entries(STATUS).map(([k,[l]])=><option key={k} value={k}>{l}</option>)}</select></label>
    <label className="pr-field grow"><span>Buscar</span><input type="search" placeholder="Empresa, CNPJ ou telefone" value={filters.q||''} onChange={e=>setFilters({...filters,q:e.target.value})}/></label>
   </div>
   <div className="pr-table-wrap"><table className="pr-table"><thead><tr><th>Empresa</th><th>Cidade</th><th>Segmento</th><th>Porte</th><th>Telefone</th><th>Situação</th></tr></thead><tbody>
    {rows.length?rows.map(r=><tr key={r.id}><td><strong>{r.trade_name||r.company_name||'—'}</strong>{r.trade_name&&r.company_name&&<small>{r.company_name}</small>}</td><td>{r.city?r.city+'/'+(r.uf||''):'—'}</td><td className="clip" title={r.segment||''}>{r.segment||'—'}</td><td>{r.size||'—'}</td><td className="mono">{r.phone}</td><td><Badge status={r.status}/></td></tr>):<tr><td colSpan="6" className="muted center">Nenhum contato. Importe uma planilha ou envie pela API.</td></tr>}
   </tbody></table></div>
  </section>
 </>;
}

function Campaigns({user,connections,summary,busy,run,reload}){
 const [data,setData]=useState({campaigns:[],batches:[]}),[form,setForm]=useState(null),[templates,setTemplates]=useState([]),[batch,setBatch]=useState({campaignId:'',size:50,filter:{uf:'',city:'',segment:'',size:''}}),[open,setOpen]=useState(null),[items,setItems]=useState([]);
 const load=()=>request('/prospecting/campaigns').then(setData);
 useEffect(()=>{load().catch(()=>{});},[summary?.total]);
 useEffect(()=>{if(!form?.connectionId){setTemplates([]);return;}request(scoped('/cadence/templates?includeDynamic=true',form.connectionId)).then(t=>setTemplates((Array.isArray(t)?t:t.templates||[]).filter(x=>!x.status||x.status==='APPROVED'))).catch(()=>setTemplates([]));},[form?.connectionId]);
 const f=summary?.facets||{uf:[],city:[],segment:[],size:[]},manage=can(user,'prospecting.manage'),approve=can(user,'prospecting.approve');
 const view=async id=>{if(open===id){setOpen(null);return;}setOpen(id);setItems(await request('/prospecting/batches/'+id));};
 return <>
  <section className="pr-card">
   <div className="pr-card-head"><Megaphone size={18}/><div><h3>Campanhas</h3><p className="muted">Cada campanha usa um número (conexão) e um modelo aprovado pela Meta. Use o número dedicado à prospecção.</p></div>{manage&&!form&&<button className="pr-push" onClick={()=>setForm({name:'',connectionId:connections[0]?.id||'',templateName:'',dailyLimit:50})}><Plus size={15}/> Nova campanha</button>}</div>
   {form&&<form className="pr-form" onSubmit={e=>{e.preventDefault();run(async()=>{setData(await request('/prospecting/campaigns',form));setForm(null);},'Campanha salva.');}}>
    <label className="pr-field"><span>Nome</span><input required value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Ex.: Varejo Fortaleza"/></label>
    <label className="pr-field"><span>Número (conexão)</span><select required value={form.connectionId} onChange={e=>setForm({...form,connectionId:e.target.value,templateName:''})}>{connections.map(c=><option key={c.id} value={c.id}>{c.name}{c.displayPhone?' · '+c.displayPhone:''}</option>)}</select></label>
    <label className="pr-field"><span>Modelo aprovado</span><select required value={form.templateName} onChange={e=>{const t=templates.find(x=>x.name===e.target.value);setForm({...form,templateName:e.target.value,templateLanguage:t?.language||'pt_BR'});}}><option value="">{templates.length?'Escolha':'Carregando ou sem modelos…'}</option>{templates.map(t=><option key={t.name+t.language} value={t.name}>{t.name}</option>)}</select></label>
    <label className="pr-field small"><span>Limite por dia</span><input type="number" min="1" max="1000" value={form.dailyLimit} onChange={e=>setForm({...form,dailyLimit:e.target.value})}/></label>
    <div className="pr-row"><button disabled={busy}>Salvar campanha</button><button type="button" className="secondary" onClick={()=>setForm(null)}>Cancelar</button></div>
   </form>}
   <div className="pr-campaigns">{data.campaigns.length?data.campaigns.map(c=><article key={c.id} className={'pr-campaign '+c.status}>
    <div><strong>{c.name}</strong><small>{c.connection_name} · modelo {c.template_name} · até {c.daily_limit}/dia · {fmt(c.prospects)} contatos</small></div>
    <span className={'pr-badge '+(c.status==='active'?'ok':'off')}>{c.status==='active'?'Ativa':'Pausada'}</span>
    {manage&&<button className="secondary" disabled={busy} onClick={()=>run(async()=>setData(await request('/prospecting/campaigns/status',{id:c.id,status:c.status==='active'?'paused':'active'})))}>{c.status==='active'?<><Pause size={14}/> Pausar</>:<><Play size={14}/> Ativar</>}</button>}
   </article>):<p className="muted">Nenhuma campanha ainda.</p>}</div>
  </section>

  {manage&&data.campaigns.length>0&&<section className="pr-card">
   <div className="pr-card-head"><Users size={18}/><div><h3>Montar lote</h3><p className="muted">Escolha o público. Os contatos ficam reservados até alguém com permissão aprovar.</p></div></div>
   <form className="pr-form" onSubmit={e=>{e.preventDefault();run(async()=>{const r=await request('/prospecting/batches',batch);await load();await reload();return r;},'Lote montado. Aguardando aprovação.');}}>
    <label className="pr-field"><span>Campanha</span><select required value={batch.campaignId} onChange={e=>setBatch({...batch,campaignId:e.target.value})}><option value="">Escolha</option>{data.campaigns.filter(c=>c.status==='active').map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <FacetSelect label="UF" value={batch.filter.uf} options={f.uf} onChange={v=>setBatch({...batch,filter:{...batch.filter,uf:v}})}/>
    <FacetSelect label="Cidade" value={batch.filter.city} options={f.city} onChange={v=>setBatch({...batch,filter:{...batch.filter,city:v}})}/>
    <FacetSelect label="Segmento" value={batch.filter.segment} options={f.segment} onChange={v=>setBatch({...batch,filter:{...batch.filter,segment:v}})}/>
    <FacetSelect label="Porte" value={batch.filter.size} options={f.size} onChange={v=>setBatch({...batch,filter:{...batch.filter,size:v}})}/>
    <label className="pr-field small"><span>Quantidade</span><input type="number" min="1" max="1000" value={batch.size} onChange={e=>setBatch({...batch,size:e.target.value})}/></label>
    <div className="pr-row"><button disabled={busy}>Montar lote</button></div>
   </form>
  </section>}

  <section className="pr-card">
   <div className="pr-card-head"><CheckCircle2 size={18}/><div><h3>Lotes</h3><p className="muted">{approve?'Confira os contatos e aprove ou recuse.':'Lotes aguardando aprovação de quem tem permissão.'} O envio dos aprovados entra na próxima etapa.</p></div></div>
   <ul className="pr-batches">{data.batches.length?data.batches.map(b=><li key={b.id} className={'pr-batch '+b.status}>
    <div className="pr-batch-row">
     <div><strong>{b.campaign_name}</strong><small>{fmt(b.size)} contatos · {[b.filter.uf,b.filter.city,b.filter.segment,b.filter.size].filter(Boolean).join(' · ')||'sem filtro'} · por {b.created_by_name||'—'} em {when(b.created_at)}</small></div>
     <span className={'pr-badge '+(b.status==='approved'?'ok':b.status==='rejected'?'off':'warn')}>{b.status==='approved'?'Aprovado':b.status==='rejected'?'Recusado':'Aguardando aprovação'}</span>
     <div className="pr-row">
      <button className="secondary" onClick={()=>view(b.id)}><Eye size={14}/> {open===b.id?'Fechar':'Ver contatos'}</button>
      {b.status==='pending'&&approve&&<><button disabled={busy} onClick={()=>run(async()=>{await request('/prospecting/batches/'+b.id+'/approve',{});await load();await reload();},'Lote aprovado.')}><CheckCircle2 size={14}/> Aprovar</button><button className="secondary danger" disabled={busy} onClick={()=>{const note=prompt('Motivo da recusa (opcional):')??null;if(note===null)return;run(async()=>{await request('/prospecting/batches/'+b.id+'/reject',{note});await load();await reload();},'Lote recusado; contatos voltaram para a base.');}}><XCircle size={14}/> Recusar</button></>}
     </div>
    </div>
    {b.decided_by_name&&<small className="muted pr-decided">{b.status==='approved'?'Aprovado':'Recusado'} por {b.decided_by_name} em {when(b.decided_at)}{b.note?' · '+b.note:''}</small>}
    {open===b.id&&<div className="pr-table-wrap"><table className="pr-table"><tbody>{items.map(i=><tr key={i.id}><td><strong>{i.trade_name||i.company_name}</strong></td><td>{i.city}/{i.uf}</td><td className="clip">{i.segment}</td><td className="mono">{i.phone}</td><td>{b.status==='pending'&&manage&&<button className="icon-button" title="Tirar do lote" aria-label="Tirar do lote" onClick={()=>run(async()=>{setItems(await request('/prospecting/batches/'+b.id+'/remove',{prospectId:i.id}));await load();})}><X size={14}/></button>}</td></tr>)}</tbody></table></div>}
   </li>):<li className="muted">Nenhum lote ainda.</li>}</ul>
  </section>
 </>;
}

function Keys({busy,run}){
 const [keys,setKeys]=useState([]),[name,setName]=useState(''),[scopes,setScopes]=useState(['prospects:write']),[created,setCreated]=useState(null),[copied,setCopied]=useState(false);
 useEffect(()=>{request('/prospecting/keys').then(setKeys).catch(()=>{});},[]);
 const base=location.origin;
 const example=`curl -X POST ${base}/api/v1/prospects \\\n  -H "Authorization: Bearer SUA_CHAVE" \\\n  -H "Content-Type: application/json" \\\n  -d '{"prospects":[{"telefone":"85999990000","razao_social":"Empresa X","cidade":"Fortaleza","uf":"CE","segmento":"Varejo","porte":"ME","perfil":{"cargo":"Sócio"}}]}'`;
 return <>
  <section className="pr-card">
   <div className="pr-card-head"><KeyRound size={18}/><div><h3>Chaves de API</h3><p className="muted">Para sistemas externos enviarem contatos de prospecção. A chave aparece uma única vez; guarde em local seguro.</p></div></div>
   <form className="pr-form" onSubmit={e=>{e.preventDefault();run(async()=>{const k=await request('/prospecting/keys',{name,scopes});setCreated(k);setName('');setKeys(await request('/prospecting/keys'));});}}>
    <label className="pr-field grow"><span>Nome da chave</span><input required minLength={3} value={name} onChange={e=>setName(e.target.value)} placeholder="Ex.: Integração Casa dos Dados"/></label>
    <fieldset className="pr-scopes"><legend>Pode</legend>{[['prospects:write','Enviar contatos'],['prospects:read','Consultar contatos e situação']].map(([k,l])=><label key={k}><input type="checkbox" checked={scopes.includes(k)} onChange={()=>setScopes(scopes.includes(k)?scopes.filter(s=>s!==k):[...scopes,k])}/>{l}</label>)}</fieldset>
    <div className="pr-row"><button disabled={busy||!scopes.length}>Gerar chave</button></div>
   </form>
   {created&&<div className="pr-key-once"><p><strong>Copie agora:</strong> esta chave não será mostrada de novo.</p><div className="pr-row"><code>{created.key}</code><button type="button" className="secondary" onClick={async()=>{try{await navigator.clipboard.writeText(created.key);setCopied(true);setTimeout(()=>setCopied(false),2000);}catch{}}}>{copied?<><Check size={14}/> Copiada</>:<><Copy size={14}/> Copiar</>}</button><button type="button" className="secondary" onClick={()=>setCreated(null)}>Já guardei</button></div></div>}
   <ul className="pr-keys">{keys.length?keys.map(k=><li key={k.id} className={k.revoked_at?'revoked':''}><div><strong>{k.name}</strong><small className="mono">ck_{k.prefix}_••••••</small><small>{k.scopes.map(s=>s==='prospects:write'?'envia':'consulta').join(' e ')} · criada {when(k.created_at)} · último uso {when(k.last_used_at)}</small></div>{k.revoked_at?<span className="pr-badge off">Revogada</span>:<button className="secondary danger" disabled={busy} onClick={()=>{if(confirm('Revogar a chave "'+k.name+'"? Quem usa esta chave para de funcionar na hora.'))run(async()=>setKeys(await request('/prospecting/keys/revoke',{id:k.id})),'Chave revogada.');}}>Revogar</button>}</li>):<li className="muted">Nenhuma chave criada.</li>}</ul>
  </section>
  <section className="pr-card">
   <h3>Como usar</h3>
   <p className="muted">Envie até 1000 contatos por chamada (60 chamadas por minuto). Campos aceitos: telefone, razao_social, nome_fantasia, cnpj, cidade, uf, segmento, cnae, porte, email, origem, aceite e perfil (livre, ex.: cargo, faturamento).</p>
   <pre className="pr-code">{example}</pre>
   <p className="muted">Resposta: quantos foram criados, atualizados e os ignorados por motivo (fixo, inválido, já é contato, descadastrado). Teste a chave com <code>GET {base}/api/v1/ping</code>.</p>
  </section>
 </>;
}

export function ProspectingPage({user,connections}){
 const [tab,setTab]=useState('base'),[summary,setSummary]=useState(null),[filters,setFilters]=useState({}),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
 const reload=()=>request('/prospecting/summary?'+new URLSearchParams(Object.fromEntries(Object.entries(filters).filter(([,v])=>v)))).then(setSummary);
 useEffect(()=>{reload().catch(e=>setError(e.message));},[JSON.stringify(filters),user.company_id]);
 async function run(fn,ok){setBusy(true);setError('');setNotice('');try{const r=await fn();if(ok)setNotice(ok);return r;}catch(e){setError(e.message);}finally{setBusy(false);}}
 const s=summary?.status||{};
 const tabs=[['base','Base de contatos'],['campaigns','Campanhas e lotes'],...(user.role==='admin'?[['keys','Chaves de API']]:[])];
 return <section className="pr-page">
  <header className="pr-head"><div><h1>Prospecção ativa</h1><p className="muted">Contatos da Casa dos Dados e da API, campanhas por número dedicado e lotes com aprovação.</p></div></header>
  <div className="pr-kpis">{[['Na base',summary?.total],['Novos',s.new],['Em lote',s.reserved],['Aprovados',s.approved],['Já contatos',s.existing],['Descadastrados',s.optout]].map(([l,v])=><div key={l} className="pr-kpi"><span>{l}</span><strong>{fmt(v)}</strong></div>)}</div>
  <nav className="pr-tabs" role="tablist">{tabs.map(([id,l])=><button key={id} role="tab" aria-selected={tab===id} className={tab===id?'active':''} onClick={()=>setTab(id)}>{l}</button>)}</nav>
  {error&&<p role="alert" className="banner error">{error}</p>}{notice&&<p role="status" className="banner success">{notice}</p>}
  {tab==='base'?<Base user={user} summary={summary} filters={filters} setFilters={setFilters} reload={reload} busy={busy} run={run}/>:tab==='campaigns'?<Campaigns user={user} connections={connections} summary={summary} busy={busy} run={run} reload={reload}/>:<Keys busy={busy} run={run}/>}
 </section>;
}
