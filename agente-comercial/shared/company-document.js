// Checks structure and verification digits, not registration or ownership at Receita Federal.
export function normalizeCompanyDocument(value){return typeof value==='string'?value.trim().toUpperCase().replace(/[.\/\-\s]/g,''):'';}
export function validCompanyDocument(value){
 const doc=normalizeCompanyDocument(value);
 if(/^(.)\1+$/.test(doc))return false;
 const dv=(text,weights)=>{const sum=[...text].reduce((n,c,i)=>n+(c.charCodeAt(0)-48)*weights[i],0),rest=sum%11;return String(rest<2?0:11-rest);};
 if(/^\d{11}$/.test(doc)){
  const first=dv(doc.slice(0,9),[10,9,8,7,6,5,4,3,2]);
  return doc.slice(-2)===first+dv(doc.slice(0,9)+first,[11,10,9,8,7,6,5,4,3,2]);
 }
 if(/^[A-Z0-9]{12}\d{2}$/.test(doc)){
  const first=dv(doc.slice(0,12),[5,4,3,2,9,8,7,6,5,4,3,2]);
  return doc.slice(-2)===first+dv(doc.slice(0,12)+first,[6,5,4,3,2,9,8,7,6,5,4,3,2]);
 }
 return false;
}
