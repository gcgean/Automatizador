export function requestsOptOut(text = '') {
  const value = String(text).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  return /^(?:stop|sair|cancelar|pare|parar|descadastrar)[.!\s]*$/.test(value)
    || /\bnao (?:me )?(?:incomode|perturbe|chame)(?: mais)?\b/.test(value)
    || /\bnao (?:me )?(?:mande|envie|mandem|enviem) (?:mais )?mensagens\b/.test(value)
    || /\b(?:nao quero|nao desejo) (?:mais )?receber (?:mais )?mensagens\b/.test(value)
    || /\b(?:pare|parem|parar) de (?:me )?(?:mandar|enviar) mensagens\b/.test(value)
    || /\b(?:remova|retire|exclua) (?:meu numero|meu contato|me) (?:da|desta|dessa) lista\b/.test(value);
}
