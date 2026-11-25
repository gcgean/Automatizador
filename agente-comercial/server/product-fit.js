// Leva o cliente para a solução mais completa do ramo dele. Ex.: oficina mecânica que pediu
// "só nota de serviço" recebe a página de oficina, que mostra o sistema completo para o ramo.
const fold=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
const AUTOMOTIVE=/\b(oficinas?|mecanic[ao]s?|auto ?centers?|centro automotivo|ramo automotivo|setor automotivo|servicos? automotivos?|funilarias?|lanternagem|borracharias?|retificas?|auto ?eletricas?|eletrica automotiva|alinhamento e balanceamento|reparacao (?:mecanica )?de veiculos|manutencao (?:mecanica )?de veiculos|conserto de (?:carros?|motos?|veiculos?))\b/;
const NEGATED=/\bnao (?:sou|somos|e|tenho|temos|trabalho com|trabalhamos com)(?: uma?)? (?:oficinas?|mecanic[ao]s?)\b/;
// Produtos "parciais" que a página de oficina substitui para quem é do ramo automotivo.
const PARTIAL=new Set(['nfse','nfe','nfce','pdv','estoque','financeiro','erp','solucoes']);

export function automotiveBusiness(texts){
 const t=fold(texts.filter(Boolean).join(' \n '));
 return !NEGATED.test(t)&&AUTOMOTIVE.test(t);
}
// Devolve o produto mais completo para o ramo, ou o próprio produto pedido.
export function completeProductFor(products,requested,texts){
 if(requested&&!PARTIAL.has(requested.id))return {product:requested,upgraded:false};
 if(!automotiveBusiness(texts))return {product:requested,upgraded:false};
 const oficina=products.find(p=>p.id==='oficina'&&p.enabled!==false&&p.salesUrl);
 return oficina?{product:oficina,upgraded:!!requested&&requested.id!=='oficina',from:requested?.id||null}:{product:requested,upgraded:false};
}
