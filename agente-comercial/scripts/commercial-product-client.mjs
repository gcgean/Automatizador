// Adaptador de servidor para os produtos. Usar com outbox persistente no sistema de origem.
import crypto from 'node:crypto';
export async function sendCommercialEvent({endpoint,secret,event,fetchImpl=fetch,now=()=>Date.now()}){
 const url=new URL(endpoint);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash||!/^\/product-events\/[a-zA-Z0-9-]+\/[a-z0-9-]+$/.test(url.pathname))throw new Error('Endpoint comercial inválido.');
 if(!/^[a-f0-9]{64}$/.test(secret||''))throw new Error('Configure a chave de integração no servidor do produto.');
 const raw=JSON.stringify(event),timestamp=String(Math.floor(now()/1000));
 const signature='sha256='+crypto.createHmac('sha256',secret).update(timestamp+'.').update(raw).digest('hex');
 const response=await fetchImpl(url.href,{method:'POST',headers:{'Content-Type':'application/json','X-Commercial-Timestamp':timestamp,'X-Commercial-Signature':signature},body:raw,signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('Integração comercial retornou HTTP '+response.status+'.');
 return response.json();
}
