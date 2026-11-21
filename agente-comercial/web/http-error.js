export function responseErrorMessage(status, text='') {
 const fallback=status>=500?'O servidor está temporariamente indisponível. Tente novamente em instantes.':status===429?'Muitas solicitações. Aguarde alguns instantes e tente novamente.':`Não foi possível concluir a solicitação (HTTP ${status}).`;
 if (/<[a-z!][^>]*>/i.test(text)) return fallback;
 let message=text.trim();
 try {const value=JSON.parse(message);message=typeof value==='string'?value:typeof value.message==='string'?value.message:typeof value.error==='string'?value.error:'';} catch {}
 if (!message || message.length>500 || /<[a-z!][^>]*>/i.test(message)) return fallback;
 return message;
}
