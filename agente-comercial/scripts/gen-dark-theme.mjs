// Gera web/theme-auto.css: versão escura das cores claras de todas as folhas de estilo.
// Fundos claros escurecem mantendo o tom; textos escuros clareiam; bordas claras escurecem.
// Regras que já têm versão .chat-dark (área de conversa) são preservadas.
// Uso: node scripts/gen-dark-theme.mjs
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath} from 'node:url';
const web=path.join(path.dirname(fileURLToPath(import.meta.url)),'..','web');
const SKIP=new Set(['theme.css','theme-auto.css']),BASE=[17,27,33],TEXT=[233,237,239];
const hex=v=>{v=v.replace('#','');if(v.length===3)v=[...v].map(c=>c+c).join('');if(v.length===8)v=v.slice(0,6);return v.length===6?[0,2,4].map(i=>parseInt(v.slice(i,i+2),16)):null;};
const named={white:[255,255,255],black:[0,0,0]};
const parse=v=>{v=v.trim().toLowerCase();if(named[v])return named[v];if(v.startsWith('#'))return hex(v);const m=v.match(/^rgba?\(([^)]+)\)$/);if(m){const p=m[1].split(/[ ,\/]+/).map(Number);if(p.length>3&&p[3]<0.5)return null;return p.slice(0,3);}return null;};
const lum=([r,g,b])=>(0.2126*r+0.7152*g+0.0722*b)/255;
const sat=([r,g,b])=>{const mx=Math.max(r,g,b),mn=Math.min(r,g,b);return mx?(mx-mn)/mx:0;};
const mix=(a,b,t)=>a.map((v,i)=>Math.round(v*t+b[i]*(1-t)));
const out=c=>'#'+c.map(v=>v.toString(16).padStart(2,'0')).join('');
const darkBg=c=>sat(c)<0.08?(lum(c)>0.97?[17,27,33]:[24,34,41]):mix(c,BASE,0.22);
const hue=([r,g,b])=>{const mx=Math.max(r,g,b),mn=Math.min(r,g,b),d=mx-mn;if(!d)return 0;const h=mx===r?((g-b)/d)%6:mx===g?(b-r)/d+2:(r-g)/d+4;return (h*60+360)%360;};
// Texto escuro neutro ou azul-marinho (texto padrão) vira o claro padrão; cores de destaque clareiam mantendo o tom.
const lightText=c=>{const neutral=sat(c)<0.25||(hue(c)>=190&&hue(c)<=250&&lum(c)<0.22);return neutral?(lum(c)<0.3?TEXT:[174,186,193]):mix(c,[255,255,255],0.4);};
const darkBorder=c=>sat(c)<0.15?[42,57,66]:mix(c,BASE,0.4);
function rules(css){const list=[];css=css.replace(/\/\*[\s\S]*?\*\//g,'');const re=/([^{}@][^{}]*)\{([^{}]*)\}/g;let m;while((m=re.exec(css)))list.push({sel:m[1].trim(),body:m[2]});return list;}
const files=fs.readdirSync(web).filter(f=>f.endsWith('.css')&&!SKIP.has(f)).sort();
const all=files.flatMap(f=>rules(fs.readFileSync(path.join(web,f),'utf8')).map(r=>({...r,file:f})));
// Seletores que já têm estilo escuro próprio na conversa.
const chatDark=new Set(all.flatMap(r=>r.sel.split(',').map(s=>s.trim()).filter(s=>s.includes('.chat-dark')).map(s=>s.replace(/^.*\.chat-dark\s*/,'').trim())));
const lines=['/* Gerado por scripts/gen-dark-theme.mjs: não editar à mão. Ajustes finos ficam em theme.css. */'];let count=0;
for(const r of all){
 const sels=r.sel.split(',').map(s=>s.trim()).filter(s=>s&&!/^(from|to|\d+%)$/.test(s)&&!s.includes('.chat-dark')&&!s.includes('data-theme')&&!s.includes('.chat-light')&&!chatDark.has(s)&&!s.startsWith(':root')&&!s.startsWith('html')&&!s.includes('::-webkit'));
 if(!sels.length)continue;const decls=[];
 for(const d of r.body.split(';')){const i=d.indexOf(':');if(i<0)continue;const prop=d.slice(0,i).trim().toLowerCase(),val=d.slice(i+1).trim().replace(/\s*!important$/,'');
  if(prop==='background'||prop==='background-color'){const c=parse(val);if(c&&lum(c)>0.82)decls.push('background:'+out(darkBg(c)));}
  else if(prop==='color'){const c=parse(val);if(c&&lum(c)<0.45)decls.push('color:'+out(lightText(c)));}
  else if(/^border(-top|-bottom|-left|-right)?(-color)?$/.test(prop)){const m=val.match(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|\bwhite\b/i);const c=m&&parse(m[0]);if(c&&lum(c)>0.7)decls.push(prop.replace(/-color$/,'')+'-color:'+out(darkBorder(c)));}
  else if(prop==='box-shadow'&&/inset/.test(val)===false&&/#[0-9a-f]{6}1[0-9a-f]|rgba\(16, ?35, ?68/i.test(val))decls.push('box-shadow:0 2px 10px rgba(0,0,0,.35)');}
 if(!decls.length)continue;count++;
 lines.push(sels.map(s=>'html[data-theme=dark] '+s).join(',')+'{'+[...new Set(decls)].join(';')+'}');
}
fs.writeFileSync(path.join(web,'theme-auto.css'),lines.join('\n')+'\n');
console.log('theme-auto.css:',count,'regras de',files.length,'arquivos');
