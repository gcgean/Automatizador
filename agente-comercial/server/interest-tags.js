const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const tagNameKey=value=>normalize(value).replace(/[^a-z0-9]+/g,' ').trim();
const fiscal=[
 {name:'NF-e',aliases:['nfe','NF-e'],pattern:/\bnf[ -]?e\b|nota(?:s)? (?:fiscal |fiscais )?(?:de )?produto/g},
 {name:'NFS-e',aliases:['nfse','NFS-e','nota de serviço'],pattern:/\bnfs[ -]?e\b|nota(?:s)? (?:fiscal |fiscais )?(?:de )?servico/g},
 {name:'NFC-e',aliases:['nfce','NFC-e'],pattern:/\bnfc[ -]?e\b|nota(?:s)? (?:de )?consumidor/g},
];
const catalog=[...fiscal,
 {name:'Gestão de loja',aliases:['gestao de loja','ERP','sistema de gestao'],pattern:/\berp\b|gestao (?:de |da |para )?(?:loja|empresa|comercial)|sistema de gestao/g},
 {name:'Controle de estoque',aliases:['estoque','controle de estoque'],pattern:/\bestoque\b/g},
 {name:'Gestão financeira',aliases:['financeiro','gestao financeira'],pattern:/\bfinanceiro\b|gestao financeira/g},
 {name:'Frente de caixa / PDV',aliases:['PDV','frente de caixa'],pattern:/\bpdv\b|frente de caixa/g},
];
function positive(text,pattern){for(const match of text.matchAll(new RegExp(pattern.source,'g'))){const before=text.slice(Math.max(0,match.index-40),match.index).split(/[,;.]/).at(-1);if(/(?:\bsem\b|\bnao\b|dispensa|dispenso).*$/.test(before))continue;const after=text.slice(match.index+match[0].length,match.index+match[0].length+25);if(/^\s+(?:nao (?:quero|preciso|desejo)|dispenso)/.test(after))continue;return true;}return false;}
export function interestTags(value){
 if(typeof value!=='string'||value.length>4000)return [];
 const text=normalize(value),found=catalog.filter(item=>positive(text,item.pattern));
 if(!found.some(item=>fiscal.includes(item))&&positive(text,/emissao (?:de )?nota|notas? fiscais?/g))found.unshift({name:'Emissão de nota fiscal',aliases:['emissao de nota fiscal','emissao de notas fiscais'],pattern:/nota/g});
 return found.slice(0,3);
}
