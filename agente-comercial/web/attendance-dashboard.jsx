import React,{useEffect,useState} from 'react';
import {Headphones,CheckCircle2,Clock,Timer,Users,Bot,CalendarDays,Filter,Search,BarChart2,Layers,Smartphone,Thermometer,Activity,MessageSquare,Download} from 'lucide-react';
import {request} from './account.jsx';
import {ClosureReasonsReport} from './closure-reasons.jsx';
import './attendance-dashboard.css';

const today=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const duration=m=>m==null?'—':m<60?m+' min':m<1440?Math.floor(m/60)+'h '+String(m%60).padStart(2,'0')+'min':Math.floor(m/1440)+'d '+Math.floor(m%1440/60)+'h';
const brDate=d=>d.split('-').reverse().join('/');
const temperatureNames={quente:'Quente',morno:'Morno',frio:'Frio',nao_classificado:'A qualificar'};

// Variação contra o período anterior de mesmo tamanho. goodUp: subir é bom (ex.: atendimentos); para tempo, subir é ruim.
function Variation({pct,before,goodUp=true}){
 if(pct===undefined)return null;
 if(pct===null)return <span className="att-var new" title="Não houve no período anterior">novo</span>;
 if(pct===0)return <span className="att-var same" title={'Período anterior: '+before}>=</span>;
 const good=pct>0===goodUp;
 return <span className={'att-var '+(good?'good':'bad')} title={'Período anterior: '+before}>{pct>0?'▲':'▼'} {Math.abs(pct)}%</span>;
}
function Kpi({icon:Icon,tone,label,value,children,big=false}){
 if(big)return <article className="att-kpi big"><div className="att-kpi-main"><span className={'att-icon '+tone}><Icon size={19}/></span><div className="att-kpi-text"><span className="att-kpi-label">{label}</span><strong>{value}</strong></div></div>{children&&<div className="att-kpi-foot">{children}</div>}</article>;
 return <article className="att-kpi"><div className="att-kpi-head"><span className={'att-icon '+tone}><Icon size={big?18:15}/></span><span className="att-kpi-label">{label}</span></div><strong>{value}</strong>{children&&<div className="att-kpi-foot">{children}</div>}</article>;
}
function Card({icon:Icon,tone,title,subtitle,children,className=''}){
 return <section className={'att-card '+className}><div className="att-card-head"><Icon size={16} className={'att-tone '+tone}/><div><h3>{title}</h3>{subtitle&&<p>{subtitle}</p>}</div></div>{children}</section>;
}
function Bars({rows,color,empty='Nenhum atendimento no período.'}){
 const max=Math.max(1,...rows.map(r=>r.total));
 if(!rows.length)return <p className="att-empty">{empty}</p>;
 return <ul className="att-bars">{rows.map((r,i)=><li key={r.id||r.name||i}><span className="att-bar-name" title={r.name}>{r.name}</span><span className="att-bar-track"><span style={{width:(r.total/max*100)+'%',background:r.color||color}}/></span><strong>{r.total}</strong><small>{r.share??''}{r.share!=null?'%':''}</small></li>)}</ul>;
}
function Sparkline({values,color='#3b82f6'}){
 if(!values?.length)return <span className="att-muted">—</span>;
 const w=86,h=20,p=2,max=Math.max(1,...values),step=values.length>1?(w-p*2)/(values.length-1):0;
 const points=values.map((v,i)=>(p+i*step).toFixed(1)+','+(h-p-v/max*(h-p*2)).toFixed(1)).join(' ');
 return <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} role="img" aria-label={'Atendimentos por dia; pico de '+max}><polyline points={points} fill="none" stroke={color} strokeWidth="1.4" strokeLinejoin="round" strokeLinecap="round"/></svg>;
}
// Gráfico diário em SVG: atendimentos abertos e finalizados por dia.
function DailyChart({rows}){
 const [hover,setHover]=useState(null);
 if(!rows.length)return <p className="att-empty">Sem dias no período.</p>;
 const W=760,H=200,L=34,R=10,T=12,B=26,max=Math.max(4,...rows.flatMap(r=>[r.opened,r.closed])),step=rows.length>1?(W-L-R)/(rows.length-1):0;
 const x=i=>L+i*step,y=v=>T+(H-T-B)*(1-v/max),line=key=>rows.map((r,i)=>x(i).toFixed(1)+','+y(r[key]).toFixed(1)).join(' ');
 const ticks=[0,Math.round(max/2),max],labelEvery=Math.max(1,Math.ceil(rows.length/10));
 return <div className="att-chart"><svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Atendimentos abertos e finalizados por dia" onMouseLeave={()=>setHover(null)}>
  {ticks.map(t=><g key={t}><line x1={L} x2={W-R} y1={y(t)} y2={y(t)} className="att-gridline"/><text x={L-6} y={y(t)+3} textAnchor="end" className="att-axis">{t}</text></g>)}
  {rows.map((r,i)=>i%labelEvery===0&&<text key={r.day} x={x(i)} y={H-8} textAnchor="middle" className="att-axis">{r.day.slice(8)}/{r.day.slice(5,7)}</text>)}
  <polyline points={line('opened')} className="att-line opened"/><polyline points={line('closed')} className="att-line closed"/>
  {rows.map((r,i)=><rect key={'h'+i} x={x(i)-Math.max(step,8)/2} y={T} width={Math.max(step,8)} height={H-T-B} fill="transparent" onMouseEnter={()=>setHover(i)}/>)}
  {hover!=null&&<g><line x1={x(hover)} x2={x(hover)} y1={T} y2={H-B} className="att-hover"/><circle cx={x(hover)} cy={y(rows[hover].opened)} r="3.5" className="att-dot opened"/><circle cx={x(hover)} cy={y(rows[hover].closed)} r="3.5" className="att-dot closed"/></g>}
 </svg>
 <div className="att-legend"><span><i className="opened"/>Abertos</span><span><i className="closed"/>Finalizados</span>{hover!=null&&<strong>{brDate(rows[hover].day)}: {rows[hover].opened} abertos · {rows[hover].closed} finalizados</strong>}</div></div>;
}

export function AttendanceReport({connectionId='default',allowExport=true}){
 const t=today();
 const [filters,setFilters]=useState({from:t.slice(0,8)+'01',to:t,connection:'',department:'',user:''}),[data,setData]=useState(null),[messages,setMessages]=useState(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[loadedKey,setLoadedKey]=useState(0);
 const [closedFilters,setClosedFilters]=useState(filters);
 const set=(k,v)=>setFilters(f=>({...f,[k]:v}));
 const messageConnection=filters.connection||connectionId,messageQuery='?'+new URLSearchParams({from:filters.from,to:filters.to,connection:messageConnection});
 async function load(){
  setBusy(true);setError('');
  try{
   const q=new URLSearchParams({from:filters.from,to:filters.to,connections:filters.connection});if(filters.department)q.set('department',filters.department);if(filters.user)q.set('user',filters.user);
   const [d,m]=await Promise.all([request('/reports/attendance?'+q),request('/reports'+messageQuery).catch(()=>null)]);
   setData(d);setMessages(m);setClosedFilters({...filters});setLoadedKey(k=>k+1);
  }catch(e){setError(e.message);}finally{setBusy(false);}
 }
 useEffect(()=>{load();},[]);
 async function exportCSV(){setBusy(true);setError('');try{const r=await fetch('/reports/messages.csv'+messageQuery,{credentials:'same-origin'});if(!r.ok)throw new Error(await r.text());const link=document.createElement('a');link.href=URL.createObjectURL(await r.blob());link.download='mensagens.csv';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);}catch(e){setError(e.message);}finally{setBusy(false);}}
 const s=data?.summary,v=data?.variation||{},prev=data?.previous||{},shownConnections=(closedFilters.connection?[closedFilters.connection]:(data?.available||[]).map(c=>c.id)).join(',');
 const colorOf=id=>data?.available.find(c=>c.id===id)?.color;
 return <section className="att-report" aria-label="Relatório de atendimentos">
  <div className="att-title"><div><h2>Relatório de Atendimentos</h2><p>Atendimentos com conversa no período, por número, setor e atendente. Datas no horário de Brasília.</p></div><button type="button" className="secondary att-export" disabled={busy||!allowExport} onClick={exportCSV}><Download size={15}/>Exportar mensagens CSV</button></div>
  <form className="att-card att-filters" onSubmit={e=>{e.preventDefault();load();}}>
   <div className="att-card-head"><Filter size={16} className="att-tone slate"/><div><h3>Filtros do Relatório</h3></div></div>
   <div className="att-filter-grid">
    <label>Data inicial<input type="date" value={filters.from} onChange={e=>set('from',e.target.value)} required/></label>
    <label>Data final<input type="date" value={filters.to} onChange={e=>set('to',e.target.value)} required/></label>
    <label>Número<select value={filters.connection} onChange={e=>set('connection',e.target.value)}><option value="">Todos os números</option>{data?.available.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
    <label>Setor<select value={filters.department} onChange={e=>set('department',e.target.value)}><option value="">Todos os setores</option>{data?.options.departments.map(d=><option key={d.id} value={d.id}>{d.name}</option>)}</select></label>
    {!data?.restricted&&<label>Atendente<select value={filters.user} onChange={e=>set('user',e.target.value)}><option value="">Todos os atendentes</option>{data?.options.users.map(u=><option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
    <button disabled={busy} className="att-search"><Search size={15}/>{busy?'Buscando…':'Buscar'}</button>
   </div>
  </form>
  {error&&<p role="alert" className="error banner">{error}</p>}
  {data&&<>
   <div className="att-kpis three">
    <Kpi big icon={Headphones} tone="blue" label="Total de atendimentos" value={s.total}><Variation pct={v.total} before={prev.total}/><span>vs. período anterior</span></Kpi>
    <Kpi big icon={CheckCircle2} tone="green" label="Finalizados" value={s.closed}><Variation pct={v.closed} before={prev.closed}/><span>{s.total?Math.round(s.closed/s.total*100):0}% do total</span></Kpi>
    <Kpi big icon={Clock} tone="amber" label="Em aberto" value={s.open}><span>abertos no período e ainda sem finalizar</span></Kpi>
   </div>
   <section className="att-card">
    <div className="att-card-head"><BarChart2 size={16} className="att-tone blue"/><div><h3>Dashboard do Período</h3><p>{brDate(filters.from)} a {brDate(filters.to)} · comparação com os {data.period.days} dias anteriores</p></div></div>
    <div className="att-kpis six">
     <Kpi icon={Headphones} tone="blue" label="Total chamados" value={s.total}/>
     <Kpi icon={Timer} tone="indigo" label="TMA médio" value={duration(s.tma)}><Variation pct={v.tma} before={duration(prev.tma)} goodUp={false}/></Kpi>
     <Kpi icon={Activity} tone="amber" label="1ª resposta média" value={duration(s.firstResponse)}><Variation pct={v.firstResponse} before={duration(prev.firstResponse)} goodUp={false}/></Kpi>
     <Kpi icon={Users} tone="purple" label="Atendentes" value={s.attendants}/>
     <Kpi icon={Bot} tone="green" label="Resolvidos pela HELENA" value={s.aiOnly==null?'—':s.aiOnly+'%'}><span>finalizados sem atendente humano</span></Kpi>
     <Kpi icon={CalendarDays} tone="slate" label="Média por dia" value={String(s.dailyAverage).replace('.',',')}/>
    </div>
   </section>
   <Card icon={Activity} tone="blue" title="Desempenho Diário" subtitle="Atendimentos abertos e finalizados por dia no período."><DailyChart rows={data.daily}/></Card>
   <div className="att-grid">
    <Card icon={Users} tone="indigo" title="Atendentes por Volume" subtitle="Atendimentos abertos no período por responsável."><Bars rows={data.byAttendant} color="#6366f1"/></Card>
    <Card icon={Layers} tone="purple" title="Atendimentos por Setor"><Bars rows={data.byDepartment} color="#a855f7"/></Card>
    <Card icon={Smartphone} tone="green" title="Atendimentos por Número"><Bars rows={data.byConnection.map(r=>({...r,color:colorOf(r.id)}))} color="#10b981"/></Card>
    <Card icon={Thermometer} tone="red" title="Interesse dos Contatos" subtitle="Classificação atual dos contatos atendidos."><Bars rows={data.temperatures.map(r=>({...r,id:r.name,name:temperatureNames[r.name]||r.name,share:s.total?Math.round(r.total/s.total*100):null}))} color="#f97316"/></Card>
   </div>
   <Card icon={Users} tone="blue" title="Desempenho por Atendente" subtitle="Ordenado por volume. TMA considera só os finalizados." className="att-table-card">
    {data.byAttendant.length?<div className="table-wrap"><table className="att-table"><thead><tr><th>Atendente</th><th>Chamados</th><th>Finalizados</th><th>Em aberto</th><th>TMA</th><th>1ª resposta</th><th>% do total</th><th>Por dia</th></tr></thead><tbody>{data.byAttendant.map(a=><tr key={a.id||'ai'}><td>{a.name}</td><td>{a.total}</td><td>{a.closed}</td><td>{a.open}</td><td>{duration(a.tma)}</td><td>{duration(a.firstResponse)}</td><td>{a.share}%</td><td><Sparkline values={a.daily}/></td></tr>)}</tbody></table></div>:<p className="att-empty">Nenhum atendimento no período.</p>}
   </Card>
   <ClosureReasonsReport connectionId={shownConnections} from={closedFilters.from} to={closedFilters.to} departmentId={closedFilters.department} userId={closedFilters.user} refreshKey={loadedKey} allowExport={allowExport}/>
   {messages&&<Card icon={MessageSquare} tone="slate" title="Mensagens do Período" subtitle={'Número: '+(data.available.find(c=>c.id===messageConnection)?.name||'atual')+'. Entregues inclui lidas; saídas incluem tentativas de envio.'}>
    <div className="att-kpis six">{[['Novos contatos',messages.leads.total],['Recebidas',messages.messages.received],['Saídas registradas',messages.messages.sent],['Entregues',messages.messages.delivered],['Lidas',messages.messages.read],['Falhas / conferir',messages.messages.failed]].map(([label,value])=><article className="att-kpi" key={label}><div className="att-kpi-head"><span className="att-kpi-label">{label}</span></div><strong>{value}</strong></article>)}</div>
    {messages.queue?.length>0&&<p className="att-note">Pendências atuais da fila: {messages.queue.map(r=>({queued:'Na fila',processing:'Em processamento',attention:'Conferir envio'}[r.status]||r.status)+': '+r.total).join(' · ')}</p>}
   </Card>}
   <p className="att-note">Contam como atendimento os chamados com ao menos uma mensagem do cliente. Contatos importados sem conversa ficam de fora.</p>
  </>}
 </section>;
}
