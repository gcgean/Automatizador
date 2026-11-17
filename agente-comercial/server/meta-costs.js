const digits=value=>String(value||'').replace(/\D/g,'');
const dateError=()=>Object.assign(new Error('Informe um período válido de até 366 dias, no último ano.'),{status:400});
export function costPeriod(from,to,now=Date.now()){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(from||'')||!/^\d{4}-\d{2}-\d{2}$/.test(to||''))throw dateError();
 const start=Date.parse(from+'T00:00:00-03:00'),last=Date.parse(to+'T00:00:00-03:00');
 if(!Number.isFinite(start)||!Number.isFinite(last)||new Date(start-10800000).toISOString().slice(0,10)!==from||new Date(last-10800000).toISOString().slice(0,10)!==to||last<start||last-start>365*86400000||start>now||start<now-366*86400000)throw dateError();
 return {from,to,start:Math.floor(start/1000),end:Math.floor(Math.min(last+86400000,now)/1000),timezone:'America/Sao_Paulo'};
}
const points=(body,field)=>(body[field]?.data||[]).flatMap(group=>group.data_points||[]);
const safeNumber=value=>typeof value==='number'&&Number.isFinite(value)&&value>=0?value:null;
const rounded=value=>Math.round((value+Number.EPSILON)*1e8)/1e8;

export class MetaCosts{
 constructor(registry,{fetchImpl=fetch,now=()=>Date.now()}={}){this.registry=registry;this.fetch=fetchImpl;this.now=now;this.cache=new Map();this.pending=new Map();}
 async graph(cfg,node,field){
  const url=new URL('https://graph.facebook.com/'+cfg.graphVersion+'/'+node);url.searchParams.set('fields',field);
  try{const response=await this.fetch(url,{headers:{Authorization:'Bearer '+cfg.accessToken},signal:AbortSignal.timeout(25000)});const body=await response.json();if(!response.ok)throw Error();return body;}catch{throw new Error('Não foi possível consultar a Meta. Confira permissões de leitura de custos, token e disponibilidade da API.');}
 }
 async connection(con,period){
  const cfg=await this.registry.configFor(con.id),phone=digits(con.displayPhone),base={connectionId:con.id,name:con.name,color:con.color,phone:con.displayPhone,currency:null,source:'Meta Graph API',fetchedAt:new Date(this.now()).toISOString()};
  if(!phone)return {...base,status:'unavailable',error:'Número de exibição indisponível para separar os custos desta conexão.',days:[]};
  const range=`.start(${period.start}).end(${period.end}).granularity(DAILY).phone_numbers(${JSON.stringify([phone])})`;
  const results=await Promise.allSettled([this.graph(cfg,cfg.wabaId,'currency'),this.graph(cfg,cfg.wabaId,'pricing_analytics'+range+'.dimensions(["PHONE","PRICING_CATEGORY","PRICING_TYPE"]).metric_types(["COST","VOLUME"])'),this.graph(cfg,cfg.wabaId,'call_analytics'+range+'.dimensions(["PHONE","DIRECTION"]).metric_types(["COST","COUNT"])')]);
  const currency=results[0].status==='fulfilled'?results[0].value.currency:null;
  if(!/^[A-Z]{3}$/.test(currency||''))return {...base,status:'unavailable',error:'A Meta não informou a moeda da conta. Nenhum valor foi presumido.',days:[]};
  const days=new Map(),invalidKinds=new Set();
  for(const [index,field,kind] of [[1,'pricing_analytics','messages'],[2,'call_analytics','calls']]){
   if(results[index].status!=='fulfilled')continue;
   for(const point of points(results[index].value,field)){
    // Never expose another phone on the same WABA, even if Meta ignores the filter.
    if(digits(point.phone_number)!==phone)continue;
    if(typeof point.start!=='number'||!Number.isFinite(point.start)){invalidKinds.add(kind);continue;}
    const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Sao_Paulo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(point.start*1000));
    if(day<period.from||day>period.to)continue;
    const cost=safeNumber(point.cost),volume=safeNumber(point[kind==='messages'?'volume':'count']);if(cost===null||volume===null){invalidKinds.add(kind);continue;}
    const row=days.get(day)||{day,messages:0,messageCost:0,calls:0,callCost:0};row[kind]+=volume;row[kind==='messages'?'messageCost':'callCost']+=cost;days.set(day,row);
   }
  }
  const messageOk=results[1].status==='fulfilled'&&!invalidKinds.has('messages'),callOk=results[2].status==='fulfilled'&&!invalidKinds.has('calls'),status=messageOk&&callOk?'ok':messageOk||callOk?'partial':'unavailable';
  const daily=[...days.values()].sort((a,b)=>a.day.localeCompare(b.day)).map(row=>({...row,messageCost:messageOk?rounded(row.messageCost):null,callCost:callOk?rounded(row.callCost):null}));
  return {...base,currency,status,...(status!=='ok'?{error:invalidKinds.size?'A Meta retornou pontos sem custo ou volume válido; total incompleto.':'Consulta parcial ou indisponível na Meta. Valores ausentes não foram tratados como zero.'}:{}),messageCost:messageOk?rounded(daily.reduce((n,d)=>n+d.messageCost,0)):null,callCost:callOk?rounded(daily.reduce((n,d)=>n+d.callCost,0)):null,messages:messageOk?daily.reduce((n,d)=>n+d.messages,0):null,calls:callOk?daily.reduce((n,d)=>n+d.calls,0):null,days:daily};
 }
 async report({from,to,connections,companyId}){
  const period=costPeriod(from,to,this.now()),all=(await this.registry.list()).filter(c=>companyId===undefined||c.companyId===companyId),ids=connections?.length?[...new Set(connections)]:all.map(c=>c.id);
  if(ids.some(id=>!all.some(c=>c.id===id)))throw Object.assign(new Error('Conexão não encontrada.'),{status:404});
  const key=JSON.stringify([from,to,ids.sort(),all.map(c=>[c.id,c.updated_at])]),cached=this.cache.get(key);if(cached&&this.now()-cached.at<300000)return cached.value;if(this.pending.has(key))return this.pending.get(key);
  const run=(async()=>{const rows=await Promise.all(all.filter(c=>ids.includes(c.id)).map(c=>this.connection(c,period)));const totals=new Map();for(const row of rows){if(row.status!=='ok')continue;const total=totals.get(row.currency)||{currency:row.currency,messageCost:0,callCost:0,total:0};total.messageCost+=row.messageCost;total.callCost+=row.callCost;total.total+=row.messageCost+row.callCost;totals.set(row.currency,total);}const value={...period,rows,totals:[...totals.values()].map(t=>({...t,messageCost:rounded(t.messageCost),callCost:rounded(t.callCost),total:rounded(t.total)})),complete:rows.every(r=>r.status==='ok'),fetchedAt:new Date(this.now()).toISOString(),notice:'Custos informados pela API da Meta, sujeitos a atualização; não são fatura, pagamento ou gasto com anúncios. Não incluem impostos, câmbio ou taxas de terceiros. Totais separados por moeda e apenas de conexões com consulta completa.'};this.cache.set(key,{at:this.now(),value});if(this.cache.size>30)this.cache.delete(this.cache.keys().next().value);return value;})();this.pending.set(key,run);try{return await run;}finally{this.pending.delete(key);}
 }
}
