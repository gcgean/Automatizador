// Meta 131026: a mensagem não pôde ser entregue naquele número (sem WhatsApp, número errado, app desatualizado ou bloqueio).
// Marca o contato para a cadência e novos envios por modelo não repetirem a tentativa; libera quando o cliente escrever.
export const UNDELIVERABLE_CODE=131026;
export const UNDELIVERABLE_MESSAGE='Este número não recebeu a última mensagem (Meta 131026): pode não ter WhatsApp, estar errado ou com o aplicativo desatualizado. Confirme o número com o cliente ou ligue antes de tentar de novo.';
export function isUndeliverable(status){return status?.status==='failed'&&(status.errors||[]).some(e=>Number(e?.code)===UNDELIVERABLE_CODE);}
export async function markUndeliverable(store,status){
 if(!isUndeliverable(status)||!status.id||!store?.pool)return false;
 const {rows:[m]}=await store.pool.query('SELECT phone FROM messages WHERE connection_id=$1 AND message_id=$2',[store.connectionId,status.id]);
 const phone=m?.phone;if(!phone)return false;
 const lead=await store.getLead(phone);if(!lead||lead.undeliverableNumber)return false;
 await store.updateLead(phone,{undeliverableNumber:true,undeliverableAt:new Date().toISOString(),undeliverableCode:UNDELIVERABLE_CODE});
 await store.pool.query("UPDATE cadence_queue SET status='stopped',reason='Número não recebe mensagens (Meta 131026)',updated_at=now() WHERE connection_id=$1 AND phone=$2 AND status IN ('waiting','queued','consent_required','awaiting_response','awaiting_delivery')",[store.connectionId,phone]);
 await store.audit?.('lead_number_undeliverable',null,{phone,messageId:status.id});
 return true;
}
export async function clearUndeliverable(store,phone){
 if(!store?.pool||!phone)return false;
 const lead=await store.getLead(phone);if(!lead?.undeliverableNumber)return false;
 await store.updateLead(phone,{undeliverableNumber:false,undeliverableAt:false,undeliverableCode:false});return true;
}
