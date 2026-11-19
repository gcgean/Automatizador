// Conservative recognition of acknowledgement/away messages, not of writing style.
export function isAutomaticReply(value){
 const t=String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/\s+/g,' ').trim();
 if(!t||t.length>1800)return false;
 // A customer can quote an automatic message while asking for help.
 if(/\?|\b(quero|preciso|gostaria|qual|quanto|como configurar|pode me|podem me|me ajude|me ajuda)\b/.test(t))return false;
 const away=/nao estamos (disponiveis|atendendo)|fora (do|de nosso) horario|nosso horario de atendimento|assim que possivel|em breve (retornaremos|responderemos)|retornaremos (em breve|assim que)/.test(t);
 const acknowledgement=/(agradecemos|obrigad[oa]) (a |o |pela? |por sua |por seu |sua |seu )?(mensagem|contato)|recebemos (sua|a sua) mensagem/.test(t);
 return (away&&acknowledgement)||(/mensagem automatica|resposta automatica|nao responda (a )?esta mensagem/.test(t)&&away);
}
