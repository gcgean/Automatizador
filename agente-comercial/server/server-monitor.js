import os from 'node:os';import fs from 'node:fs/promises';
import {telemetry,percentile} from './telemetry.js';
export function cpuTotals(cpus){return cpus.reduce((a,c)=>({idle:a.idle+c.times.idle,total:a.total+Object.values(c.times).reduce((s,n)=>s+n,0)}),{idle:0,total:0});}
export function cpuPercent(before,after){const total=after.total-before.total;return total>0?Math.max(0,Math.min(100,100*(1-(after.idle-before.idle)/total))):null;}
export class ServerMonitor{
 constructor(store,dataDir){this.store=store;this.dataDir=dataDir;this.previous=cpuTotals(os.cpus());this.processCpu=process.cpuUsage();this.started=Date.now();}
 async init(){await this.store.pool.query('CREATE TABLE IF NOT EXISTS server_monitor_samples(at timestamptz PRIMARY KEY,data jsonb NOT NULL)');telemetry.enabled=true;await this.sample();this.timer=setInterval(()=>this.sample().catch(()=>console.error('[monitor] Falha ao salvar amostra.')),60000);this.timer.unref();}
 async sample(){if(this.running)return this.running;this.running=this.collect().finally(()=>{this.running=null;});return this.running;}
 async collect(){const now=Date.now(),cpu=cpuTotals(os.cpus()),usage=process.cpuUsage(),cores=os.cpus().length||1;let memoryAvailable=os.freemem(),memoryTotal=os.totalmem();try{const text=await fs.readFile('/proc/meminfo','utf8');memoryAvailable=Number(text.match(/^MemAvailable:\s+(\d+)/m)?.[1])*1024||memoryAvailable;memoryTotal=Number(text.match(/^MemTotal:\s+(\d+)/m)?.[1])*1024||memoryTotal;}catch{}
 let disk=null;try{const s=await fs.statfs(this.dataDir);disk={total:s.blocks*s.bsize,free:s.bavail*s.bsize,used:(s.blocks-s.bfree)*s.bsize};}catch{}
 const data={cpu:cpuPercent(this.previous,cpu),cores,memory:{total:memoryTotal,used:memoryTotal-memoryAvailable},disk,uptime:os.uptime(),process:{rss:process.memoryUsage().rss,cpu:100*((usage.user-this.processCpu.user)+(usage.system-this.processCpu.system))/1000/Math.max(1,now-this.started)/cores,uptime:process.uptime()},requests:[...telemetry.requests],queries:[...telemetry.queries]};
 this.previous=cpu;this.processCpu=usage;this.started=now;telemetry.requests=new Map();telemetry.queries=new Map();
 await this.store.pool.query('INSERT INTO server_monitor_samples(at,data) VALUES($1,$2)',[new Date(now),data]);await this.store.pool.query("DELETE FROM server_monitor_samples WHERE at<now()-interval '8 days'");
 }
 async report(days=1,connection=null){const rows=(await this.store.pool.query("SELECT at,data FROM server_monitor_samples WHERE at>=now()-($1::int*interval '1 day') ORDER BY at",[days])).rows;const routes=new Map(),queries=new Map();
 const merge=(map,items)=>{for(const [key,row] of items||[]){const [id,label]=JSON.parse(key);if(connection&&id!==connection)continue;const old=map.get(label)||{count:0,total:0,max:0,errors:0,bins:Array(14).fill(0)};old.count+=row.count;old.total+=row.total;old.max=Math.max(old.max,row.max);old.errors+=row.errors;old.bins=old.bins.map((n,i)=>n+row.bins[i]);map.set(label,old);}};
 const history=rows.map(r=>{merge(routes,r.data.requests);merge(queries,r.data.queries);const current=new Map();merge(current,r.data.requests);const sum={count:0,total:0,max:0,bins:Array(14).fill(0)};for(const v of current.values()){sum.count+=v.count;sum.total+=v.total;sum.max=Math.max(sum.max,v.max);sum.bins=sum.bins.map((n,i)=>n+v.bins[i]);}return {at:r.at,cpu:r.data.cpu,memory:100*r.data.memory.used/r.data.memory.total,disk:r.data.disk?100*r.data.disk.used/r.data.disk.total:null,latency:sum.count?sum.total/sum.count:null,p95:sum.count?percentile(sum):null,requests:sum.count};});
 const top=map=>[...map].map(([label,r])=>({label,...r,bins:undefined,mean:r.total/r.count,p95:percentile(r)})).sort((a,b)=>b.total-a.total).slice(0,30);
 const connections=(await this.store.pool.query(`SELECT c.id,c.name,e.name AS company,
 (SELECT count(*)::int FROM messages m WHERE m.connection_id=c.id AND m.occurred_at>=now()-($1::int*interval '1 day') AND m.direction='in') AS received,
 (SELECT count(*)::int FROM messages m WHERE m.connection_id=c.id AND m.occurred_at>=now()-($1::int*interval '1 day') AND m.direction='out' AND COALESCE(m.data->>'state','')<>'internal') AS sent,
 (SELECT count(*)::int FROM inbox_jobs j WHERE j.connection_id=c.id AND j.status IN ('queued','processing','attention')) AS pending,
 (SELECT COALESCE(sum(size),0)::text FROM media_attachments a WHERE a.connection_id=c.id AND a.path IS NOT NULL) AS media_bytes
 FROM whatsapp_connections c JOIN companies e ON e.id=c.company_id ORDER BY c.name`,[days])).rows;
 const last=rows.at(-1);return {updatedAt:last?.at||null,current:last?{...last.data,requests:undefined,queries:undefined}:null,history:history.filter((_,i)=>i%Math.max(1,Math.ceil(history.length/600))===0||i===history.length-1),routes:top(routes),queries:top(queries),connections};
 }
 async close(){clearInterval(this.timer);await this.running;await this.sample();telemetry.enabled=false;}
}
