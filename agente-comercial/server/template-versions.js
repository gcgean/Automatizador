// Versões de modelo: "nome_v2" substitui "nome_v1" assim que a Meta aprova a versão nova.
// Enquanto a nova não for aprovada, a antiga continua sendo usada; nada precisa mudar nas configurações salvas.
export function templateBase(name){return String(name||'').replace(/_v\d+$/,'');}
export function templateVersion(name){const m=String(name||'').match(/_v(\d+)$/);return m?Number(m[1]):0;}
export function latestTemplates(templates){
 const best=new Map();
 for(const t of templates){const key=templateBase(t.name)+'|'+t.language,current=best.get(key);if(!current||templateVersion(t.name)>templateVersion(current.name))best.set(key,t);}
 return templates.filter(t=>best.get(templateBase(t.name)+'|'+t.language)===t);
}
// Mesmo modelo, em qualquer versão (a lista já vem só com a versão mais nova aprovada).
export function sameTemplate(t,name,language){return templateBase(t.name)===templateBase(name)&&t.language===language;}
