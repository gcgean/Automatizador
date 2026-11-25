// Integração com a API da Casa dos Dados (https://docs.casadosdados.com.br).
// A chave da conta é colada pelo administrador na tela de Prospecção e fica cifrada no banco;
// nunca volta para a tela nem para os registros.
import {encryptSecret,decryptSecret} from './secrets.js';

const API='https://api.casadosdados.com.br';
const fail=(message,status=400)=>Object.assign(new Error(message),{status});
const list=(v,max=50,len=80)=>[...new Set((Array.isArray(v)?v:String(v||'').split(/[,;\n]/)).map(s=>String(s).trim()).filter(Boolean).map(s=>s.slice(0,len)))].slice(0,max);
const UF=new Set('AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' '));
const PORTES={'01':'Micro Empresa','03':'Empresa de Pequeno Porte','05':'Demais'};
const fold=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().trim();

// Monta o corpo da pesquisa avançada (v5) a partir dos filtros da tela.
export function buildSearch(f={}){
 const ufs=list(f.uf,27,2).map(s=>s.toUpperCase()).filter(s=>UF.has(s));
 const body={situacao_cadastral:['ATIVA'],mais_filtros:{com_telefone:true,somente_celular:true,excluir_empresas_visualizadas:f.excludeViewed!==false,somente_matriz:!!f.onlyHeadquarters}};
 if(ufs.length)body.uf=ufs.map(s=>s.toLowerCase());
 const cities=list(f.cities,30).map(fold);if(cities.length)body.municipio=cities;
 const bairros=list(f.neighborhoods,30).map(fold);if(bairros.length)body.bairro=bairros;
 const ddd=list(f.ddd,20,2).filter(s=>/^\d{2}$/.test(s));if(ddd.length)body.ddd=ddd;
 const cnae=list(f.cnae,40,9).map(s=>s.replace(/\D/g,'')).filter(s=>s.length===7);if(cnae.length){body.codigo_atividade_principal=cnae;if(f.secondaryCnae)body.incluir_atividade_secundaria=true;}
 const words=list(f.keywords,10);if(words.length)body.busca_textual=[{texto:words,tipo_busca:'radical',razao_social:true,nome_fantasia:true,nome_socio:false}];
 const portes=list(f.sizes,3,2).filter(s=>PORTES[s]);if(portes.length)body.porte_empresa={codigos:portes};
 if(f.mei==='only')body.mei={optante:true};else if(f.mei==='exclude')body.mei={excluir_optante:true};
 const min=+f.capitalMin,max=+f.capitalMax;if(min>0||max>0)body.capital_social={...(min>0?{minimo:Math.round(min)}:{}),...(max>0?{maximo:Math.round(max)}:{})};
 const days=Math.round(+f.openedDays);if(days>0)body.data_abertura={ultimos_dias:Math.min(days,3650)};
 if(!body.uf&&!body.municipio&&!body.ddd&&!body.codigo_atividade_principal&&!body.busca_textual)throw fail('Escolha ao menos um filtro: estado, cidade, DDD, CNAE ou palavra-chave.');
 body.limite=Math.min(1000,Math.max(1,Math.round(+f.limit||100)));
 body.pagina=Math.max(1,Math.round(+f.page||1));
 return body;
}

// Converte uma empresa da resposta "completo" no formato de prospect. Os nomes dos campos de
// contato variam entre versões, então aceita as formas conhecidas.
export function companyToProspect(c){
 if(!c||typeof c!=='object')return null;
 const phones=[];
 const addPhone=x=>{if(!x)return;if(typeof x==='string'||typeof x==='number')return phones.push(String(x));if(typeof x==='object')phones.push(String(x.completo||x.telefone||x.numero_completo||((x.ddd||'')+(x.numero||''))));};
 for(const key of ['contato_telefonico','telefones','telefone','contatos_telefonicos'])[].concat(c[key]||[]).forEach(addPhone);
 for(const key of ['telefone1','telefone_1','telefone2','telefone_2'])addPhone(c[key]);
 const email=[].concat(c.contato_email||c.emails||c.email||[]).map(x=>typeof x==='object'?x?.email:x).find(Boolean)||'';
 const act=c.atividade_principal||{};const end=c.endereco||{};
 const size=c.porte_empresa?.descricao||(typeof c.porte_empresa==='string'?c.porte_empresa:'');
 const profile={};
 if(c.capital_social)profile.capital=String(c.capital_social);
 if(c.data_abertura)profile.abertura=String(c.data_abertura);
 if(end.bairro)profile.bairro=String(end.bairro);
 const mei=c.mei?.optante??c.simples?.mei;if(mei!==undefined)profile.mei=mei?'Sim':'Não';
 if(c.descricao_natureza_juridica)profile.natureza=String(c.descricao_natureza_juridica);
 const socio=(c.quadro_societario||[])[0]?.nome;if(socio)profile.contato=String(socio);
 profile.origem='API Casa dos Dados';
 return {phones,cnpj:String(c.cnpj||'').replace(/\D/g,''),company:c.razao_social||'',trade:c.nome_fantasia||'',city:end.municipio||'',uf:String(end.uf||'').toUpperCase(),
  segment:act.descricao||c.atividade_principal_descricao||'',cnae:String(act.codigo||c.codigo_atividade_principal||''),size,email:String(email),profile};
}

export class CasaDosDados{
 constructor(prospecting,{fetch:fetchImpl=globalThis.fetch}={}){this.p=prospecting;this.fetch=fetchImpl;}
 get pool(){return this.p.pool;}
 get secret(){return this.p.config.connectionsKey;}
 async init(){
  await this.pool.query(`CREATE TABLE IF NOT EXISTS casa_dos_dados_settings(company_id text PRIMARY KEY REFERENCES companies(id),api_key_cipher text NOT NULL,key_hint text,updated_by uuid,updated_at timestamptz NOT NULL DEFAULT now(),last_balance int,last_checked_at timestamptz)`);
 }
 async row(companyId){return (await this.pool.query('SELECT * FROM casa_dos_dados_settings WHERE company_id=$1',[companyId])).rows[0];}
 async status(user){
  this.p.need(user,'prospecting.view');const r=await this.row(user.company_id);
  return r?{configured:true,hint:r.key_hint,updatedAt:r.updated_at,balance:r.last_balance,checkedAt:r.last_checked_at}:{configured:false};
 }
 async call(apiKey,method,path,body){
  let res;
  try{res=await this.fetch(API+path,{method,headers:{'api-key':apiKey,'content-type':'application/json',accept:'application/json'},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(45000)});}
  catch{throw fail('Não consegui falar com a Casa dos Dados agora. Tente de novo em instantes.',502);}
  const text=await res.text();let data=null;try{data=text?JSON.parse(text):null;}catch{}
  if(res.status===401)throw fail('A Casa dos Dados recusou a chave. Gere uma nova chave no portal e cole aqui.',400);
  if(res.status===403)throw fail('Sem saldo na Casa dos Dados para essa operação. Recarregue o saldo no portal.',402);
  if(!res.ok)throw fail('A Casa dos Dados respondeu com erro ('+res.status+')'+(data?.mensagem||data?.message?': '+String(data.mensagem||data.message).slice(0,200):'.'),502);
  return data;
 }
 async key(companyId){const r=await this.row(companyId);if(!r)throw fail('Conecte a Casa dos Dados primeiro: cole a chave da API.',400);return decryptSecret(r.api_key_cipher,this.secret);}
 async saveKey(user,{apiKey}){
  if(user.role!=='admin')throw fail('Somente administradores conectam a Casa dos Dados.',403);
  const key=String(apiKey||'').trim();if(key.length<16||key.length>400||/\s/.test(key))throw fail('Essa não parece uma chave da Casa dos Dados. Copie a chave inteira do portal.');
  const saldo=await this.call(key,'GET','/v5/saldo');// valida a chave antes de guardar
  const balance=Number.isFinite(+saldo?.saldo_total)?Math.round(+saldo.saldo_total):null;
  await this.pool.query(`INSERT INTO casa_dos_dados_settings(company_id,api_key_cipher,key_hint,updated_by,last_balance,last_checked_at) VALUES($1,$2,$3,$4,$5,now())
   ON CONFLICT(company_id) DO UPDATE SET api_key_cipher=excluded.api_key_cipher,key_hint=excluded.key_hint,updated_by=excluded.updated_by,updated_at=now(),last_balance=excluded.last_balance,last_checked_at=now()`,
   [user.company_id,encryptSecret(key,this.secret),'••••'+key.slice(-4),user.id,balance]);
  await this.p.store.audit?.('casa_dos_dados_connected',user.id,{companyId:user.company_id});
  return this.status(user);
 }
 async removeKey(user){
  if(user.role!=='admin')throw fail('Somente administradores desconectam a Casa dos Dados.',403);
  await this.pool.query('DELETE FROM casa_dos_dados_settings WHERE company_id=$1',[user.company_id]);
  await this.p.store.audit?.('casa_dos_dados_disconnected',user.id,{companyId:user.company_id});
  return {configured:false};
 }
 async balance(user){
  this.p.need(user,'prospecting.view');const saldo=await this.call(await this.key(user.company_id),'GET','/v5/saldo');
  const total=Math.round(+saldo?.saldo_total||0);
  await this.pool.query('UPDATE casa_dos_dados_settings SET last_balance=$2,last_checked_at=now() WHERE company_id=$1',[user.company_id,total]);
  const details=Object.entries(saldo?.saldos||{}).map(([name,d])=>({name,value:Math.round(+d?.valor||0),expiresAt:d?.expira_em||null}));
  return {total,details};
 }
 async search(user,filters={}){
  this.p.need(user,'prospecting.manage');
  const body=buildSearch(filters);const key=await this.key(user.company_id);
  const data=await this.call(key,'POST','/v5/cnpj/pesquisa?tipo_resultado=completo',body);
  const found=Array.isArray(data?.cnpjs)?data.cnpjs:[];
  const items=found.map(companyToProspect);
  const stats=await this.p.ingest(user.company_id,items,{source:'casa-dos-dados-api',userId:user.id,fileName:'Busca na API ('+found.length+' empresas)'});
  await this.p.store.audit?.('prospects_imported',user.id,{companyId:user.company_id,source:'casa-dos-dados-api',received:stats.received,created:stats.created});
  // Se nenhuma empresa trouxe telefone, devolve só os nomes dos campos (nunca os dados) para diagnóstico.
  const noPhones=found.length>0&&items.every(i=>!i?.phones?.length);
  let balance=null;try{balance=(await this.balance(user)).total;}catch{}
  return {...stats,total:Number(data?.total)||0,page:body.pagina,limit:body.limite,hasMore:body.pagina*body.limite<(Number(data?.total)||0),balance,
   ...(noPhones?{warning:'A Casa dos Dados não devolveu telefones nessa busca.',fields:Object.keys(found[0]||{}).slice(0,40)}:{})};
 }
 async handle(req,path,body,user){
  if(req.method==='GET'&&path==='/prospecting/cdd')return this.status(user);
  if(req.method==='GET'&&path==='/prospecting/cdd/balance')return this.balance(user);
  if(req.method==='POST'&&path==='/prospecting/cdd/key')return this.saveKey(user,body);
  if(req.method==='POST'&&path==='/prospecting/cdd/remove')return this.removeKey(user);
  if(req.method==='POST'&&path==='/prospecting/cdd/search')return this.search(user,body);
  return undefined;
 }
}
