import {request} from './account.jsx';

let loading;
export function prepareBusinessSignup() {
  if (!loading) loading = (async () => {
    const config = await request('/connections/business-app');
    if (!config.configId) throw new Error('Configure META_EMBEDDED_SIGNUP_CONFIG_ID no servidor para conectar o aplicativo.');
    await new Promise((resolve,reject) => {
      const script = document.createElement('script');
      const timeout = setTimeout(failed,15000);
      function cleanup() {
        clearTimeout(timeout);
        delete window.fbAsyncInit;
      }
      function failed() {
        cleanup();
        script.remove();
        reject(new Error('O SDK da Meta não carregou. Confira se o navegador bloqueou connect.facebook.net neste site e tente novamente.'));
      }
      window.fbAsyncInit = () => {
        cleanup();
        try {
          window.FB.init({appId:config.appId,version:config.version,xfbml:false});
          resolve();
        } catch(error) {reject(error);}
      };
      if (window.FB?.getLoginStatus && !window.FB.__buffer) return window.fbAsyncInit();
      script.src = 'https://connect.facebook.net/pt_BR/sdk.js';
      script.onerror = failed;
      document.head.appendChild(script);
    });
    return config.configId;
  })().catch(error => {loading=null;throw error;});
  return loading;
}

export function businessSignup(configId) {
  return new Promise((resolve,reject) => {
    let code, ids;
    const timer = setTimeout(()=>finish(new Error('O cadastro expirou. Abra a conexão novamente.')), 10*60*1000);
    function finish(error) {
      window.removeEventListener('message',receive);
      clearTimeout(timer);
      if (error) reject(error);
      else resolve({...ids,code});
    }
    function receive(event) {
      if (!['https://www.facebook.com','https://web.facebook.com'].includes(event.origin)) return;
      let payload;
      try {payload=typeof event.data==='string'?JSON.parse(event.data):event.data;} catch {return;}
      if (payload?.type !== 'WA_EMBEDDED_SIGNUP') return;
      if (['CANCEL','ERROR'].includes(payload.event)) return finish(new Error('Cadastro interrompido na Meta.'));
      if (!['FINISH','FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING'].includes(payload.event)) return;
      if (payload.event === 'FINISH' || payload.data?.is_on_biz_app !== true) return finish(new Error('A Meta concluiu o fluxo sem confirmar o WhatsApp Business do celular.'));
      const {phone_number_id,messaging_account_ids} = payload.data;
      if (!phone_number_id || !Array.isArray(messaging_account_ids) || !messaging_account_ids.length) return finish(new Error('A Meta não informou a conta de mensagens e o número da coexistência.'));
      ids={phoneNumberId:phone_number_id,messagingAccountIds:messaging_account_ids};
      if (code) finish();
    }
    window.addEventListener('message',receive);
    try {
      window.FB.login(response => {
        code=response.authResponse?.code;
        if (!code) return finish(new Error('O login da Meta foi cancelado.'));
        if (ids) finish();
      },{config_id:configId,response_type:'code',override_default_response_type:true,extras:{version:'v5'}});
    } catch(error) {finish(error);}
  });
}
