// Cria somente modelos de mensagem; não envia mensagens a contatos.
import {loadDotEnv,loadConfig} from '../server/config.js';
import {PgStore} from '../server/pg-store.js';
import {ConnectionRegistry} from '../server/connections.js';
import {CommercialGrowth} from '../server/commercial-growth.js';
loadDotEnv();const config=loadConfig(),store=new PgStore(config.databaseUrl,config.dataDir),registry=new ConnectionRegistry(store,config),growth=new CommercialGrowth(store,config),apply=process.argv.includes('--apply');
const common=[{name:'cadencia_primeiro_uso_v1',body:'Sua conta no {{1}} já foi criada. Se precisar de ajuda para dar o primeiro passo, responda por aqui e nossa equipe orienta você. Se preferir não receber acompanhamento, é só avisar.',example:'Cilos Frotas'},{name:'cadencia_avancar_contratacao_v1',body:'Sobre sua experiência com o {{1}}, ficou alguma dúvida para continuar? Nossa equipe pode ajudar com os próximos passos e as condições de contratação. Se preferir não receber acompanhamento, é só avisar.',example:'Cilos Frotas'}];
try{
 const connections=(await store.pool.query("SELECT DISTINCT c.id FROM whatsapp_connections c JOIN commercial_products p ON p.connection_id=c.id WHERE c.company_id='default' AND c.enabled AND COALESCE(c.channel,'whatsapp')='whatsapp'")).rows;
 const catalogs=new Map();let created=0,linked=0,planned=0,conflicts=0;
 async function call(c,path,body){const response=await fetch('https://graph.facebook.com/'+c.graphVersion+'/'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+c.accessToken,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});const data=await response.json();if(!response.ok)throw new Error('Meta retornou HTTP '+response.status+' / código '+(data.error?.code||'desconhecido'));return data;}
 for(const {id} of connections){const c=await registry.configFor(id);if(!c.wabaId||!c.accessToken)continue;
  if(!catalogs.has(c.wabaId)){const all=[];let next=c.wabaId+'/message_templates?fields=name,status,language,components&limit=100';for(let page=0;next&&page<10;page++){const result=await call(c,next);all.push(...result.data||[]);next=null;if(result.paging?.next){const pageUrl=new URL(result.paging.next);if(pageUrl.hostname!=='graph.facebook.com'||pageUrl.protocol!=='https:'||!pageUrl.pathname.startsWith('/'+c.graphVersion+'/'))throw new Error('Paginação Meta inválida.');pageUrl.searchParams.delete('access_token');next=pageUrl.pathname.replace('/'+c.graphVersion+'/','')+pageUrl.search;}}catalogs.set(c.wabaId,all);}
  const available=catalogs.get(c.wabaId);
  for(const p of await growth.products(id)){
   if(p.enabled===false)continue;const name='comercial_produto_'+p.id.replace(/-/g,'_')+'_v1';const body='Olá! '+(p.id==='solucoes'?'Conheça as soluções Cilos':(p.trialConfirmed?'Você pode começar o teste do ':'Conheça o ')+p.name)+' por aqui: {{1}}. Se preferir conversar com nossa equipe, responda esta mensagem. Se não quiser receber acompanhamento, é só avisar.';
   for(const t of [{name,body,example:p.trialConfirmed?p.trialUrl:p.salesUrl||p.landingUrl},...common]){
    planned++;let found=available.find(a=>a.name===t.name&&a.language==='pt_BR');
    if(found&&found.components?.find(x=>x.type==='BODY')?.text!==t.body){conflicts++;continue;}
    if(!found&&apply){const result=await call(c,c.wabaId+'/message_templates',{name:t.name,language:'pt_BR',category:'MARKETING',components:[{type:'BODY',text:t.body,example:{body_text:[[t.example]]}}]});found={name:t.name,language:'pt_BR',status:result.status||'PENDING',components:[{type:'BODY',text:t.body}]};available.push(found);created++;}
    if(t.name===name&&apply&&found){const changed=await store.pool.query("UPDATE commercial_products SET data=jsonb_set(data,'{templateName}',to_jsonb($3::text)),version=version+1,updated_at=now() WHERE connection_id=$1 AND id=$2 AND COALESCE(data->>'templateName','')=''",[id,p.id,name]);linked+=changed.rowCount;}
   }
  }
 }
 console.log(JSON.stringify({mode:apply?'applied':'preview',connections:connections.length,planned,created,linked,conflicts}));
}finally{await store.close();}
