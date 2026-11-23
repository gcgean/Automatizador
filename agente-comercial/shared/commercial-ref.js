// Importar no produto de destino. Não contém segredo; a assinatura é feita só no servidor.
export function captureCommercialRef(location,storage){
 const ref=new URLSearchParams(location.search).get('commercial_ref');
 if(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(ref||'')){try{storage.setItem('commercial_ref',ref);}catch{}return ref;}
 try{return storage.getItem('commercial_ref')||null;}catch{return null;}
}
