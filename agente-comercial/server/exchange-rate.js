export class DollarRate{
 constructor({fetchImpl=fetch,now=()=>Date.now()}={}){this.fetch=fetchImpl;this.now=now;this.cached=null;this.pending=null;}
 async get(){
  if(this.cached&&this.now()-this.cached.at<3600000)return this.cached.value;
  if(this.pending)return this.pending;
  this.pending=(async()=>{let value={available:false,source:'Banco Central · PTAX venda'};try{
   const format=time=>new Intl.DateTimeFormat('en-US',{timeZone:'America/Sao_Paulo',month:'2-digit',day:'2-digit',year:'numeric'}).format(new Date(time)).replaceAll('/','-');
   const url=new URL('https://olinda.bcb.gov.br/olinda/servico/PTAX/versao/v1/odata/CotacaoDolarPeriodo(dataInicial=@dataInicial,dataFinalCotacao=@dataFinalCotacao)');
   for(const [k,v] of Object.entries({'@dataInicial':"'"+format(this.now()-10*86400000)+"'",'@dataFinalCotacao':"'"+format(this.now())+"'",'$format':'json','$orderby':'dataHoraCotacao desc','$top':'1'}))url.searchParams.set(k,v);
   const response=await this.fetch(url.toString().replaceAll('+','%20'),{signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();const row=(await response.json()).value?.[0];
   if(typeof row?.cotacaoVenda!=='number'||!Number.isFinite(row.cotacaoVenda)||row.cotacaoVenda<=0||!/^\d{4}-\d{2}-\d{2}/.test(row.dataHoraCotacao||''))throw Error();
   value={available:true,brlPerUsd:row.cotacaoVenda,date:row.dataHoraCotacao.slice(0,10),source:'Banco Central · PTAX venda'};
  }catch{}this.cached={at:this.now()-(value.available?0:3300000),value};return value;})();
  try{return await this.pending;}finally{this.pending=null;}
 }
}
export function convertedCost(row,rate){
 const amounts=[row.messageCost,row.callCost].filter(x=>typeof x==='number'&&Number.isFinite(x)&&x>=0);
 if(!amounts.length)return {usd:null,brl:null,partial:true};
 const total=amounts.reduce((a,b)=>a+b,0),fx=rate?.available&&rate.brlPerUsd>0?rate.brlPerUsd:null;
 return {nativeTotal:total,currency:row.currency,partial:row.status!=='ok'||amounts.length!==2,usd:row.currency==='USD'?total:row.currency==='BRL'&&fx?total/fx:null,brl:row.currency==='BRL'?total:row.currency==='USD'&&fx?total*fx:null,usdEstimated:row.currency!=='USD',brlEstimated:row.currency!=='BRL'};
}
