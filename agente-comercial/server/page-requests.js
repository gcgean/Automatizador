// Quando a HELENA entende a necessidade do cliente e nenhuma página do catálogo serve, ela registra o pedido
// e avisa os gestores no Telegram (bot e destinatários configurados em Crescimento comercial). Um aviso por contato.
import crypto from 'node:crypto';
import {decryptSecret} from './secrets.js';
import {WANTS_SQL} from './telegram-alerts.js';
const fail=message=>Object.assign(new Error(message),{status:400});
const clean=(value,max)=>String(value??'').replace(/\s+/g,' ').trim().slice(0,max);

export const PAGE_REQUEST_TOOL={name:'sinalizar_pagina_faltante',strict:true,
 description:'Avisa os gestores que falta uma página comercial para a necessidade deste cliente. Use só depois de entender a necessidade e só quando nenhuma página do CATÁLOGO OPERACIONAL DE LINKS servir (por exemplo, um ramo ou solução sem página própria). Não substitui o atendimento: continue respondendo o cliente normalmente e não prometa página nova.',
 input_schema:{type:'object',additionalProperties:false,required:['necessidade','ramo','sugestao_pagina'],properties:{
  necessidade:{type:'string',description:'O que o cliente quer resolver, em uma frase, sem dados pessoais.'},
  ramo:{type:['string','null'],description:'Ramo ou tipo de negócio do cliente, se informado.'},
  sugestao_pagina:{type:'string',description:'Título curto da página que atenderia esse público. Ex.: "Sistema para clínica veterinária".'}}}};

export const PAGE_REQUEST_INSTRUCTIONS='\n\nPÁGINA QUE FALTA: se, depois de entender a necessidade, nenhuma página do catálogo servir para o caso do cliente, use sinalizar_pagina_faltante uma vez para avisar os gestores, e continue o atendimento normalmente (tire dúvidas, ofereça vídeo ou vendedor). Não diga ao cliente que uma página será criada.';

export function validatePageRequest(input){
 const need=clean(input?.necessidade,300),segment=clean(input?.ramo,80)||null,suggestion=clean(input?.sugestao_pagina,120);
 if(need.length<10)throw fail('Descreva a necessidade do cliente em uma frase.');
 if(suggestion.length<5)throw fail('Sugira um título curto para a página.');
 return {need,segment,suggestion};
}

export async function telegramPageAlert(pool,config,{companyId,connectionName,need,segment,suggestion},fetchImpl=fetch){
 const bot=(await pool.query('SELECT token_cipher FROM commercial_telegram WHERE company_id=$1 AND enabled AND token_cipher IS NOT NULL',[companyId])).rows[0];if(!bot)return 0;
 const recipients=(await pool.query("SELECT r.chat_cipher FROM commercial_telegram_recipients r JOIN users u ON u.id=r.user_id AND u.active WHERE r.company_id=$1 AND "+WANTS_SQL("'page_request'"),[companyId])).rows;
 const token=decryptSecret(bot.token_cipher,config.connectionsKey),text='Página que falta\nA HELENA atendeu um cliente sem página adequada no catálogo.\nNecessidade: '+need+(segment?'\nRamo: '+segment:'')+'\nSugestão de página: '+suggestion+(connectionName?'\nConexão: '+connectionName:'');
 let sent=0;
 for(const r of recipients){try{const response=await fetchImpl('https://api.telegram.org/bot'+token+'/sendMessage',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({chat_id:decryptSecret(r.chat_cipher,config.connectionsKey),text,protect_content:true}),signal:AbortSignal.timeout(10000)});const data=await response.json().catch(()=>({}));if(response.ok&&data.ok)sent++;}catch{}}
 return sent;
}

export async function requestPage(store,phone,input,config,{fetchImpl=fetch}={}){
 const request=validatePageRequest(input);
 const {rows:[row]}=await store.pool.query('INSERT INTO page_requests(id,connection_id,phone,need,segment,suggestion) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT(connection_id,phone) DO NOTHING RETURNING id',[crypto.randomUUID(),store.connectionId,phone,request.need,request.segment,request.suggestion]);
 if(!row)return {already:true};
 await store.audit?.('page_request_created',null,{phone,suggestion:request.suggestion});
 // O aviso não pode atrasar nem derrubar a resposta ao cliente.
 const connection=await store.getConnection();
 telegramPageAlert(store.pool,config,{companyId:connection.company_id,connectionName:connection.name,...request},fetchImpl).then(sent=>sent&&store.pool.query('UPDATE page_requests SET notified_at=now() WHERE id=$1',[row.id])).catch(()=>{});
 return {created:true,...request};
}
