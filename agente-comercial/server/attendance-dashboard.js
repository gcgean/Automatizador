// Dashboard de atendimentos: chamados com ao menos uma mensagem do cliente no período.
// Chamados sem conversa (ex.: contatos importados) ficam de fora para não distorcer os números.
const TZ='America/Sao_Paulo',UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const day=date=>new Intl.DateTimeFormat('en-CA',{timeZone:TZ,year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(date));
const minutes=(a,b)=>(new Date(b)-new Date(a))/60000;
const avg=values=>values.length?Math.round(values.reduce((s,v)=>s+v,0)/values.length):null;
const pct=(part,total)=>total?Math.round(part/total*100):null;
const variation=(now,before)=>now==null||before==null?undefined:before===0?(now===0?0:null):Math.round((now-before)/before*100);

async function tickets(pool,{connectionIds,from,to,departmentId,userId}){
 return (await pool.query(`SELECT t.id,t.connection_id,t.opened_at,t.closed_at,t.assigned_user_id,t.department_id,fi.first_in,fo.first_out,
   EXISTS(SELECT 1 FROM messages m WHERE m.ticket_id=t.id AND m.direction='out' AND m.data->>'actor'='human') AS human,
   l.data->>'temperatura' AS temperature
  FROM service_tickets t
  CROSS JOIN LATERAL (SELECT min(m.occurred_at) AS first_in FROM messages m WHERE m.ticket_id=t.id AND m.direction='in') fi
  LEFT JOIN LATERAL (SELECT min(m.occurred_at) AS first_out FROM messages m WHERE m.ticket_id=t.id AND m.direction='out' AND m.data->>'actor' IN ('ai','human') AND m.occurred_at>=fi.first_in) fo ON true
  LEFT JOIN leads l ON l.connection_id=t.connection_id AND l.phone=t.phone
  WHERE t.connection_id=ANY($1) AND t.opened_at>=$2 AND t.opened_at<$3 AND fi.first_in IS NOT NULL
   AND ($4::uuid IS NULL OR t.department_id=$4) AND ($5::uuid IS NULL OR t.assigned_user_id=$5)`,[connectionIds,from,to,departmentId,userId])).rows;
}
function summary(rows){
 const closed=rows.filter(r=>r.closed_at),responded=rows.filter(r=>r.first_out);
 return {total:rows.length,closed:closed.length,open:rows.length-closed.length,
  tma:avg(closed.map(r=>minutes(r.opened_at,r.closed_at))),
  firstResponse:avg(responded.map(r=>minutes(r.first_in,r.first_out))),
  attendants:new Set(rows.map(r=>r.assigned_user_id).filter(Boolean)).size,
  aiOnly:pct(closed.filter(r=>!r.human).length,closed.length)};
}
export function dashboardFilters(url){
 const department=url.searchParams.get('department')||null,user=url.searchParams.get('user')||null;
 if(department&&!UUID.test(department)||user&&!UUID.test(user))throw Object.assign(new Error('Filtro inválido.'),{status:400});
 return {departmentId:department,userId:user,connections:(url.searchParams.get('connections')||'').split(',').filter(Boolean)};
}
export async function attendanceDashboard(pool,{companyId,connections,from,to,departmentId=null,userId=null}){
 const connectionIds=connections.map(c=>c.id),span=new Date(to)-new Date(from),previousFrom=new Date(new Date(from).getTime()-span).toISOString();
 const [rows,previousRows,{rows:users},{rows:departments}]=await Promise.all([
  tickets(pool,{connectionIds,from,to,departmentId,userId}),
  tickets(pool,{connectionIds,from:previousFrom,to:from,departmentId,userId}),
  pool.query("SELECT id,COALESCE(NULLIF(name,''),email) AS name FROM users WHERE COALESCE(company_id,'default')=$1 ORDER BY lower(COALESCE(NULLIF(name,''),email))",[companyId]),
  pool.query('SELECT id,name FROM departments WHERE company_id=$1 AND active ORDER BY lower(name)',[companyId])]);
 const now=summary(rows),before=summary(previousRows);
 // Dias do período no horário de Brasília (até 366).
 const days=[];for(let t=new Date(from).getTime()+3*3600000;t<new Date(to).getTime();t+=86400000){const d=day(t);if(days.at(-1)!==d)days.push(d);}
 const daily=days.map(d=>({day:d,opened:0,closed:0})),index=new Map(days.map((d,i)=>[d,i]));
 for(const r of rows){const o=index.get(day(r.opened_at)),c=r.closed_at?index.get(day(r.closed_at)):undefined;if(o!==undefined)daily[o].opened++;if(c!==undefined)daily[c].closed++;}
 const userName=new Map(users.map(u=>[u.id,u.name])),deptName=new Map(departments.map(d=>[d.id,d.name])),connName=new Map(connections.map(c=>[c.id,c.name]));
 const group=(key,name)=>{const map=new Map();for(const r of rows){const k=key(r)||'';if(!map.has(k))map.set(k,[]);map.get(k).push(r);}return [...map].map(([k,list])=>{const s=summary(list),spark=days.map(()=>0);for(const r of list){const i=index.get(day(r.opened_at));if(i!==undefined)spark[i]++;}return {id:k||null,name:name(k),total:s.total,closed:s.closed,open:s.open,tma:s.tma,firstResponse:s.firstResponse,share:pct(s.total,rows.length),daily:spark};}).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name));};
 const temperatures={};for(const r of rows){const t=r.temperature||'nao_classificado';temperatures[t]=(temperatures[t]||0)+1;}
 return {
  period:{from,to,days:days.length,previousFrom},
  summary:{...now,dailyAverage:days.length?Math.round(now.total/days.length*10)/10:0},
  previous:before,
  variation:{total:variation(now.total,before.total),closed:variation(now.closed,before.closed),tma:variation(now.tma,before.tma),firstResponse:variation(now.firstResponse,before.firstResponse)},
  daily,
  byAttendant:group(r=>r.assigned_user_id,k=>k?userName.get(k)||'Usuário removido':'HELENA (sem atendente)'),
  byDepartment:group(r=>r.department_id,k=>k?deptName.get(k)||'Setor removido':'Sem setor'),
  byConnection:group(r=>r.connection_id,k=>connName.get(k)||k),
  temperatures:Object.entries(temperatures).map(([name,total])=>({name,total})).sort((a,b)=>b.total-a.total),
  options:{users,departments,connections:connections.map(c=>({id:c.id,name:c.name,color:c.color}))}
 };
}
