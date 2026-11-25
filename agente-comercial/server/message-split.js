// Separa os links da resposta em mensagens próprias, para o cliente tocar no link com facilidade.
// "Aqui está a página: https://x\n\nDepois me conta" -> ["Aqui está a página:", "https://x", "Depois me conta"]
const URL_RE=/https?:\/\/[^\s<>()]*[^\s<>().,!?;:'"]/g;
export function splitLinks(text){
 const s=String(text||'');const urls=s.match(URL_RE);
 if(!urls||!s.replace(URL_RE,'').trim())return [s];
 const parts=[];let last=0;
 // Sobras curtas entre links ("e", "ou") não viram mensagem própria.
 const keep=t=>(t.match(/\p{L}/gu)||[]).length>=3;
 for(const m of s.matchAll(URL_RE)){const before=s.slice(last,m.index).replace(/^[\s.,;:!?]+(?=\S)/,'').trim();if(keep(before))parts.push(before);parts.push(m[0]);last=m.index+m[0].length;}
 const after=s.slice(last).replace(/^[\s.,;:!?]+(?=\S)/,'').trim();if(keep(after))parts.push(after);
 return parts;
}
