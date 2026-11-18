// Leitura de agendas exportadas: vCard (.vcf) do Android/iPhone e planilhas .csv (inclusive Google Contatos).
function decodeQuotedPrintable(text){const bytes=[];const s=text.replace(/=\r?\n/g,'');for(let i=0;i<s.length;i++){if(s[i]==='='&&/^[0-9A-F]{2}$/i.test(s.slice(i+1,i+3))){bytes.push(parseInt(s.slice(i+1,i+3),16));i+=2;}else bytes.push(...new TextEncoder().encode(s[i]));}return new TextDecoder().decode(new Uint8Array(bytes));}
export function parseVcf(text){
 const unfolded=text.replace(/\r\n/g,'\n').replace(/=\n/g,'=').replace(/\n[ \t]/g,'').replace(//g,'\n');
 return unfolded.split(/BEGIN:VCARD/i).slice(1).map(card=>{let name='',n='',phone='';
  for(const line of card.split('\n')){const i=line.indexOf(':');if(i<0)continue;const head=line.slice(0,i),raw=line.slice(i+1).trim(),field=head.split(';')[0].replace(/^[^.]+\./,'').toUpperCase(),value=/ENCODING=QUOTED-PRINTABLE/i.test(head)?decodeQuotedPrintable(raw):raw;
   if(field==='FN'&&!name)name=value.replace(/\\,/g,',').trim();
   else if(field==='N'&&!n)n=value.split(';').slice(0,3).reverse().filter(Boolean).join(' ').trim();
   else if(field==='TEL'&&(!phone||/CELL|MOBILE/i.test(head)))phone=value;}
  return {name:name||n,phone};}).filter(c=>c.name||c.phone);
}
export function parseCsv(text){
 const lines=text.replace(/^﻿/,'').split(/\r?\n/).filter(l=>l.trim());if(!lines.length)return [];
 const sep=(lines[0].match(/;/g)||[]).length>(lines[0].match(/,/g)||[]).length?';':',';
 const split=line=>{const out=[];let cur='',q=false;for(const ch of line){if(ch==='"')q=!q;else if(ch===sep&&!q){out.push(cur);cur='';}else cur+=ch;}out.push(cur);return out.map(v=>v.trim());};
 const header=split(lines[0]).map(h=>h.toLowerCase());
 let nameCol=header.findIndex(h=>/^(nome|name|nome completo|full name)$/.test(h));if(nameCol<0)nameCol=header.findIndex(h=>/nome|name/.test(h)&&!/sobrenome|last|family|middle/.test(h));
 let phoneCol=header.findIndex(h=>/(phone|telefone|celular|fone|whats).*(value|valor)|^(telefone|celular|whatsapp|phone|fone)$/.test(h));if(phoneCol<0)phoneCol=header.findIndex(h=>/phone|telefone|celular|fone|whats/.test(h));
 const hasHeader=nameCol>=0||phoneCol>=0;if(!hasHeader){nameCol=0;phoneCol=1;}
 return lines.slice(hasHeader?1:0).map(split).map(cols=>({name:cols[nameCol]||'',phone:(cols[phoneCol]||'').split(':::')[0]})).filter(c=>c.name||c.phone);
}
