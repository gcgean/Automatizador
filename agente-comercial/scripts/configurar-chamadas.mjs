import {loadConfig,loadDotEnv} from '../server/config.js';
loadDotEnv();const config=loadConfig();
const mode=process.argv[2]||'--check';
if(!['--check','--prepare','--enable','--disable'].includes(mode))throw new Error('Use --check, --prepare, --enable ou --disable.');
async function graph(path,token=config.accessToken,body){
 const response=await fetch(`https://graph.facebook.com/${config.graphVersion}/${path}`,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(20000)});
 const data=await response.json();if(!response.ok)throw new Error('A Meta recusou a configuração (código '+(data.error?.code||response.status)+'). Confira as credenciais e os requisitos do número.');return data;
}
try{
 if(!config.accessToken||!config.appSecret)throw new Error('Configure as credenciais da Meta no .env.');
 const appToken=config.appId+'|'+config.appSecret;
 const subscriptions=await graph(config.appId+'/subscriptions',appToken);
 const subscription=subscriptions.data?.find(s=>s.object==='whatsapp_business_account'&&s.active);
 if(mode==='--prepare'||mode==='--enable'){
  if(!subscription||subscription.callback_url!==config.publicUrl+'/webhook')throw new Error('O webhook ativo não corresponde a este servidor. Confira PUBLIC_URL antes de alterar a assinatura.');
  const fields=[...new Set(['messages','calls',...(subscription.fields||[]).map(f=>f.name)])];
  await graph(config.appId+'/subscriptions',appToken,{object:'whatsapp_business_account',callback_url:subscription.callback_url,verify_token:config.verifyToken,fields:fields.join(','),include_values:true});
 }
 if(mode!=='--check')await graph(config.phoneNumberId+'/settings',config.accessToken,{calling:{status:mode==='--disable'?'DISABLED':'ENABLED',call_icon_visibility:mode==='--enable'?'DEFAULT':'DISABLE_ALL',callback_permission_status:mode==='--enable'?'ENABLED':'DISABLED'}});
 const current=await graph(config.phoneNumberId+'/settings');
 const updated=await graph(config.appId+'/subscriptions',appToken);
 console.log(JSON.stringify({phoneNumberId:config.phoneNumberId,calling:{status:current.calling?.status,visibility:current.calling?.call_icon_visibility,callback:current.calling?.callback_permission_status},webhookFields:updated.data?.find(s=>s.object==='whatsapp_business_account')?.fields?.map(f=>f.name)},null,2));
}catch(e){console.error(e.message);process.exitCode=1;}
