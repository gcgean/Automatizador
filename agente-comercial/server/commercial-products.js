import {tagNameKey,interestTags} from './interest-tags.js';

export const PRODUCT_SEEDS=[
 {id:'solucoes',name:'Soluções Cilos',tags:[],benefit:'Conheça as opções para atendimento, gestão comercial e frotas.',conditions:'Cada produto possui contratação, recursos e condições próprios. Escolha a solução que deseja conhecer.',family:'cilos'},
 {id:'nfe',name:'NF-e',tags:['NF-e','Emissão de nota fiscal'],benefit:'Conheça a emissão de notas de produtos.',family:'command'},
 {id:'nfse',name:'NFS-e',tags:['NFS-e'],benefit:'Conheça a emissão de notas de serviços.',family:'command'},
 {id:'nfce',name:'NFC-e',tags:['NFC-e'],benefit:'Conheça a emissão de cupom fiscal.',family:'command'},
 {id:'pdv',name:'Frente de caixa / PDV',tags:['Frente de caixa / PDV'],benefit:'Conheça a operação de vendas no caixa.',family:'command'},
 {id:'estoque',name:'Controle de estoque',tags:['Controle de estoque'],benefit:'Organize produtos e acompanhe entradas e saídas.',family:'command'},
 {id:'financeiro',name:'Gestão financeira',tags:['Gestão financeira'],benefit:'Conheça o acompanhamento financeiro da empresa.',family:'command'},
 {id:'erp',name:'Gestão de loja',tags:['Gestão de loja'],benefit:'Conheça a gestão de vendas, estoque e financeiro.',family:'command'},
 {id:'oficina',name:'Oficina / Ordens de serviço',salesUrl:'https://commandweb.net/oficina',conditions:'Contratação e acesso conforme os planos e condições da página oficial. Não anunciar teste gratuito nem cadastro gratuito sem confirmação.',firstStep:'Abra a página oficial, confira os planos e selecione Assinar e começar para seguir o cadastro nas condições apresentadas.',tags:['Oficina / Ordens de serviço'],benefit:'Conheça a organização de ordens de serviço, peças e serviços.',family:'command'},
 {id:'contador',name:'Command para contadores',tags:['Contadores'],benefit:'Conheça a oferta para escritórios contábeis.',salesUrl:'https://commandweb.net/contador',conditions:'A página informa cadastro grátis; a emissão é cobrada conforme as condições da oferta.',family:'command'},
 {id:'cte',name:'CT-e',tags:['CT-e'],benefit:'Converse com a equipe sobre emissão de CT-e e seus requisitos.',family:'command'},
 {id:'mdfe',name:'MDF-e',tags:['MDF-e'],benefit:'Converse com a equipe sobre emissão de MDF-e e seus requisitos.',family:'command'},
 {id:'frotas',name:'Cilos Frotas',tags:['Cilos Frotas'],benefit:'Organize os veículos e acompanhe os custos da frota.',salesUrl:'https://frotas.cilos.com.br/',trialUrl:'https://frotas.cilos.com.br/',trialConfirmed:true,conditions:'Teste de 7 dias sem cartão, conforme a base comercial conferida em 20/11/2026.',firstStep:'Comece pelo cadastro de um veículo.',family:'cilos'},
 {id:'chat',name:'CilosChat',tags:['CilosChat'],benefit:'Conheça a organização dos atendimentos da equipe.',trialUrl:'https://chat.cilos.com.br/login',trialConfirmed:true,conditions:'A página oferece criação de conta e 7 dias de teste. Demais condições dependem de confirmação.',firstStep:'Selecione Criar Nova Conta. A configuração de canais depende dos requisitos de cada canal.',family:'cilos'},
 {id:'crm',name:'Cilos CRM',tags:['Cilos CRM'],benefit:'Conheça a organização de leads e oportunidades.',salesUrl:'https://crm.cilos.com.br/login',conditions:'Condições do teste e criação de empresa nova pendentes de confirmação.',family:'cilos'},
 {id:'helena',name:'HELENA Comercial',tags:['HELENA Comercial'],benefit:'Conheça o atendimento comercial com IA e acompanhamento da equipe.',conditions:'Demonstração e liberação pela equipe. Sem cadastro público confirmado.',family:'cilos'}
];
export function safeProductUrl(value){
 if(!value)return '';let u;try{u=new URL(value);}catch{throw new Error('Informe um endereço HTTPS válido.');}
 if(u.protocol!=='https:'||u.username||u.password||u.port&&u.port!=='443'||u.search||u.hash||value.length>500||!u.hostname.includes('.')||/^(localhost|127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(u.hostname)||u.hostname.includes(':')||u.hostname.endsWith('.local'))throw new Error('Use uma URL pública HTTPS, sem credenciais, parâmetros ou fragmentos.');
 return u.href;
}
export function validateProduct(body){
 const str=(key,max)=>{const v=body[key]??'';if(typeof v!=='string'||v.length>max)throw new Error('Confira o campo '+key+'.');return v.trim();};
 const id=str('id',50);if(!/^[a-z][a-z0-9-]{0,49}$/.test(id))throw new Error('Identificador inválido.');
 const name=str('name',100);if(!name)throw new Error('Informe o nome.');
 if(!Array.isArray(body.tags)||body.tags.length>12||body.tags.some(t=>typeof t!=='string'||!t.trim()||t.length>60))throw new Error('Confira as tags.');
 const trialUrl=safeProductUrl(str('trialUrl',500)),salesUrl=safeProductUrl(str('salesUrl',500)),conditions=str('conditions',1000);
 if(body.trialConfirmed&&(!trialUrl||!conditions))throw new Error('Confirme a URL e as condições antes de habilitar o teste.');
 const templateName=str('templateName',100);if(templateName&&!/^\w+$/.test(templateName))throw new Error('Nome do modelo inválido.');
 return {id,name,tags:[...new Set(body.tags.map(t=>t.trim()))],benefit:str('benefit',500),firstStep:str('firstStep',500),salesUrl,trialUrl,trialConfirmed:body.trialConfirmed===true,conditions,templateName,enabled:body.enabled!==false,language:'pt_BR'};
}
export function chooseProduct(products,lead,tags=[]){
 const interests=new Set([...tags,...interestTags(lead?.produtos_interesse||'').map(t=>t.name)].map(tagNameKey));
 const found=products.filter(p=>p.enabled!==false&&p.tags.some(t=>interests.has(tagNameKey(t))));
 // A tag de público é mais específica que o tipo de nota; não enviar oferta contábil a empresas em geral.
 const segment=String(lead?.segmento||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase(),mechanic=!/\bnao\b/.test(segment)&&(/oficina (?:mecanica|automotiva|de (?:carros|motos|veiculos))|mecanica automotiva|auto ?center/.test(segment)||segment.trim()==='oficina');
 return found.find(p=>p.id==='contador')||(mechanic?products.find(p=>p.enabled!==false&&p.id==='oficina'):null)||found.find(p=>p.id==='oficina')||found[0]||null;
}
export const productGaps=p=>[!p.salesUrl&&'Página comercial',!p.trialConfirmed&&'Teste confirmado',!p.templateName&&'Modelo de cadência',!p.integrationReady&&'Integração de uso'].filter(Boolean);
