// Sem --apply, somente conta os acompanhamentos afetados. Nunca envia mensagens.
import {loadDotEnv,loadConfig} from '../server/config.js';
import {PgStore} from '../server/pg-store.js';
import {requestsOptOut} from '../server/consent.js';
loadDotEnv();const config=loadConfig();if(!config.databaseUrl)throw new Error('Configure DATABASE_URL.');
const store=new PgStore(config.databaseUrl,config.dataDir),apply=process.argv.includes('--apply');
try{
 const rows=(await store.pool.query("SELECT q.connection_id,q.phone FROM cadence_queue q JOIN whatsapp_connections c ON c.id=q.connection_id WHERE c.company_id='default' AND q.status IN ('waiting','queued','awaiting_response','awaiting_delivery')")).rows;
 let affected=0;
 for(const q of rows){const events=(await store.pool.query("SELECT occurred_at,data->>'text' AS text FROM messages WHERE connection_id=$1 AND phone=$2 AND direction='in' AND occurred_at>now()-interval '30 days' ORDER BY occurred_at DESC LIMIT 200",[q.connection_id,q.phone])).rows;const refusal=events.find(e=>requestsOptOut(e.text));if(!refusal)continue;affected++;
  if(apply)await store.scope(q.connection_id).transaction(async tx=>{const r=await tx.pool.query('SELECT data FROM leads WHERE connection_id=$1 AND phone=$2 FOR UPDATE',[q.connection_id,q.phone]);if(!r.rows[0])return;await tx.updateLead(q.phone,{optedOut:true,cadenceDeclined:true,status:'bloqueado',optedOutAt:new Date(refusal.occurred_at).toISOString(),cadenceStopReason:'Recusa explícita reconciliada no histórico'});await tx.pool.query("UPDATE cadence_queue SET status='stopped',reason='Recusa explícita reconciliada no histórico',updated_at=now() WHERE connection_id=$1 AND phone=$2",[q.connection_id,q.phone]);await tx.pool.query("UPDATE cadence_attempts SET status='skipped',error='Recusa explícita do cliente' WHERE connection_id=$1 AND phone=$2 AND status='queued'",[q.connection_id,q.phone]);await tx.audit('historical_optout_reconciled',null,{phone:q.phone,refusalAt:refusal.occurred_at});});
 }
 console.log(JSON.stringify({mode:apply?'applied':'preview',examined:rows.length,affected}));
}finally{await store.close();}
