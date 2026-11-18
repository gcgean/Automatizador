export function requestsOptOut(text = '') {
  const value = String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return /^(?:stop|sair|cancelar|pare|parar|descadastrar)[.!\s]*$/.test(value)
    || /\bnao (?:me )?(?:incomode|perturbe|chame)(?: mais)?\b/.test(value)
    || /\bnao (?:me )?(?:mande|envie|mandem|enviem) (?:mais )?mensagens\b/.test(value)
    || /\b(?:nao quero|nao desejo) (?:mais )?receber (?:mais )?mensagens\b/.test(value)
    || /\b(?:pare|parem|parar) de (?:me )?(?:mandar|enviar) mensagens\b/.test(value)
    || /\b(?:remova|retire|exclua) (?:meu numero|meu contato|me) (?:da|desta|dessa) lista\b/.test(value);
}

// Recusa clara de interesse (não confunde com um "não" respondendo a uma pergunta).
export function declinesInterest(text = '') {
  const value = String(text).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  if (!value || value.includes('?')) return false;
  return requestsOptOut(value)
    || /\bnao (?:tenho|temos|ha) (?:mais )?(?:nenhum )?interesse\b/.test(value)
    || /\b(?:perdi|perdemos) o interesse\b/.test(value)
    || /^(?:sem interesse|nao tenho interesse|desinteressad[oa])[.!\s]*$/.test(value)
    || /\bnao (?:estou|to|tou|estamos|fiquei|ficamos) (?:mais )?interessad[oa]s?\b/.test(value)
    || /\bnao (?:quero|queremos|preciso|precisamos) mais\b/.test(value)
    || /\bnao me (?:procure|procurem|chame|chamem|ligue|liguem)(?: mais)?\b/.test(value);
}
