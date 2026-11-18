// Aviso sonoro de novo lead: preferência por aparelho, som gerado no navegador (sem arquivo).
const KEY='command-lead-sound';
let context=null;
export function leadSoundEnabled(){try{return localStorage.getItem(KEY)!=='off';}catch{return true;}}
export function setLeadSoundEnabled(on){try{localStorage.setItem(KEY,on?'on':'off');}catch{}}
function audio(){
 const Ctx=window.AudioContext||window.webkitAudioContext;if(!Ctx)return null;
 context??=new Ctx();if(context.state==='suspended')context.resume().catch(()=>{});return context;
}
// O navegador só libera o som depois de um clique na página; prepara o áudio no primeiro clique.
export function unlockLeadSound(){const unlock=()=>{audio();window.removeEventListener('pointerdown',unlock);window.removeEventListener('keydown',unlock);};window.addEventListener('pointerdown',unlock);window.addEventListener('keydown',unlock);return unlock;}
export function playLeadSound(force=false){
 if(!force&&!leadSoundEnabled())return;
 const ctx=audio();if(!ctx)return;
 const start=ctx.currentTime+.02;
 [[880,0],[1318.5,.16]].forEach(([freq,delay])=>{const osc=ctx.createOscillator(),gain=ctx.createGain();osc.type='sine';osc.frequency.value=freq;gain.gain.setValueAtTime(0,start+delay);gain.gain.linearRampToValueAtTime(.25,start+delay+.02);gain.gain.exponentialRampToValueAtTime(.001,start+delay+.45);osc.connect(gain).connect(ctx.destination);osc.start(start+delay);osc.stop(start+delay+.5);});
}
