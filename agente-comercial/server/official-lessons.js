import crypto from 'node:crypto';
export const OFFICIAL_LESSONS_URL='https://commandweb.net/api/public/aulas';
export function lessonProducts(slug,title=''){
 const s=slug.toLowerCase(),t=title.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
 if(s==='oficina_os'||s==='rel_oficina')return ['oficina','erp'];
 if(s==='fiscal_nfse')return ['nfse'];
 if(s==='fiscal_cte'||s==='fiscal_ciot')return ['cte'];
 if(s==='fiscal_mdfe')return ['mdfe'];
 if(s==='fis_notas_fiscais')return /nf.?c.?e|cupom/.test(t)?['nfce','pdv']:['nfe'];
 if(/^est_|^rel_estoque|^cad_(produtos|fabricantes|locais_estoque|motivos_ajuste_estoque|secoes|tipos_produto|unidades_medida)/.test(s))return ['estoque','erp'];
 if(/^fin_|^boletos$|^pix_integrado$|^cad_(bancos|contas_correntes|plano_contas|admin_cartao)|^rel_contas_receber/.test(s))return ['financeiro','erp'];
 if(s==='fat_vendas'||s==='smart_pos'||s==='config_caixas')return ['pdv','erp'];
 return ['erp'];
}
export function parseOfficialLessons(payload){
 if(!payload||!Number.isInteger(payload.totalVideos)||payload.totalVideos<1||payload.totalVideos>2000||!Array.isArray(payload.categorias))throw new Error('Catálogo oficial inválido ou vazio; biblioteca preservada.');
 const result=[],ids=new Set();
 for(const category of payload.categorias){
  if(!/^[a-z0-9_\-]{1,100}$/.test(category.slug||'')||typeof category.nome!=='string'||category.nome.length>150||!Array.isArray(category.videos))throw new Error('Categoria oficial inválida.');
  for(const v of category.videos){
   if(!/^[0-9a-f-]{36}$/i.test(v.id||'')||ids.has(v.id)||!/^[A-Za-z0-9_-]{11}$/.test(v.youtubeId||'')||typeof v.titulo!=='string'||!v.titulo.trim()||v.titulo.length>300||typeof v.descricao!=='string'||v.descricao.length>20000)throw new Error('Aula oficial inválida ou duplicada.');
   ids.add(v.id);const productIds=lessonProducts(category.slug,v.titulo);
   const data={title:v.titulo.slice(0,150),summary:v.descricao.slice(0,2000),visualNotes:'',tags:[category.nome],questions:[],chapters:[],purpose:'recurso',youtubeId:v.youtubeId,youtubeUrl:'https://www.youtube.com/watch?v='+v.youtubeId,productIds,source:{url:OFFICIAL_LESSONS_URL,id:v.id,category:category.slug,categoryName:category.nome,kind:'official_description',description:v.descricao}};
   result.push({sourceId:v.id,productId:productIds[0],data});
  }
 }
 if(result.length!==payload.totalVideos)throw new Error('Catálogo incompleto; biblioteca preservada.');
 return result;
}
export async function synchronizeOfficialLessons(store,{apply=false,fetchImpl=fetch}={}){
 const response=await fetchImpl(OFFICIAL_LESSONS_URL,{signal:AbortSignal.timeout(30000),redirect:'error'});
 if(!response.ok)throw new Error('Fonte oficial indisponível: HTTP '+response.status);
 const raw=await response.text();if(raw.length>4*1024*1024)throw new Error('Catálogo oficial excede limite.');
 const lessons=parseOfficialLessons(JSON.parse(raw)),report={source:OFFICIAL_LESSONS_URL,lessons:lessons.length,connections:0,created:0,updated:0,unchanged:0,removed:0,apply};
 return store.transaction(async tx=>{
  await tx.pool.query("SELECT pg_advisory_xact_lock(hashtextextended('command-official-lessons',0))");
  const connections=(await tx.pool.query("SELECT c.id FROM whatsapp_connections c JOIN companies e ON e.id=c.company_id LEFT JOIN context_profiles p ON p.id=c.context_id WHERE c.company_id='default' AND e.active AND (c.context_id='default' OR (c.context_id IS DISTINCT FROM 'cilos-comercial' AND p.body LIKE '%Command Server%'))")).rows;
  for(const connection of connections){
   const products=new Set((await tx.pool.query('SELECT id FROM commercial_products WHERE connection_id=$1',[connection.id])).rows.map(p=>p.id));
   if(!lessons.every(l=>products.has(l.productId)))throw new Error('Catálogo da conexão incompleto. Execute a inicialização comercial antes de sincronizar.');
   report.connections++;
   const prior=(await tx.pool.query("SELECT id,data FROM demonstration_videos WHERE connection_id=$1 AND data->'source'->>'url'=$2",[connection.id,OFFICIAL_LESSONS_URL])).rows;
   for(const lesson of lessons){
    const old=prior.find(r=>r.data.source.id===lesson.sourceId),fingerprint=crypto.createHash('sha256').update(JSON.stringify(lesson.data)).digest('hex');
    if(old?.data.source.fingerprint===fingerprint){report.unchanged++;continue;}
    report[old?'updated':'created']++;
    if(!apply)continue;
    const data={...lesson.data,source:{...lesson.data.source,fingerprint,syncedAt:new Date().toISOString()}};
    if(old)await tx.pool.query("UPDATE demonstration_videos SET product_id=$2,data=$3,version=version+1,published=true,transcript=CASE WHEN data->>'youtubeId'=$4 THEN transcript ELSE '' END,segments=CASE WHEN data->>'youtubeId'=$4 THEN segments ELSE '[]'::jsonb END,updated_at=now() WHERE id=$1",[old.id,lesson.productId,data,data.youtubeId]);
    else await tx.pool.query('INSERT INTO demonstration_videos(id,connection_id,product_id,data,published) VALUES($1,$2,$3,$4,true)',[crypto.randomUUID(),connection.id,lesson.productId,data]);
   }
   // Entries missing from a valid feed remain available until reviewed; a feed outage cannot erase knowledge.
  }
  if(apply&&(report.created||report.updated))await tx.pool.query("INSERT INTO audit_log(action,details) VALUES('official_lessons_sync',$1)",[report]);
  return report;
 });
}
