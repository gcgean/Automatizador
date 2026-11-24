export function ticketPreferenceKey(user){return 'command:new-ticket:'+String(user.company_id||'default')+':'+user.id;}
export function readTicketPreferences(user){try{const value=JSON.parse(localStorage.getItem(ticketPreferenceKey(user))||'{}');return value&&typeof value==='object'&&!Array.isArray(value)?value:{};}catch{return {};}}
export function saveTicketPreferences(user,connection,selection){try{const current=readTicketPreferences(user);localStorage.setItem(ticketPreferenceKey(user),JSON.stringify({connection,byConnection:{...(current.byConnection&&typeof current.byConnection==='object'?current.byConnection:{}),...(selection?{[connection]:{...current.byConnection?.[connection],...selection}}:{})}}));}catch{}}
export function initialTicketPurpose(user,connections){const saved=readTicketPreferences(user).byConnection?.[initialTicketConnection(user,connections)]?.purpose;return typeof saved==='string'?saved.slice(0,500):'';}
// Última mensagem de abertura enviada pelo usuário neste número; volta preenchida no próximo chamado.
export function initialTicketMessage(user,connections){const saved=readTicketPreferences(user).byConnection?.[initialTicketConnection(user,connections)]?.message;return typeof saved==='string'?saved.slice(0,1000):'';}
export function initialTicketConnection(user,connections){const usable=connections.filter(c=>(!c.channel||c.channel==='whatsapp')&&c.enabled!==false),saved=readTicketPreferences(user).connection;return usable.some(c=>c.id===saved)?saved:usable[0]?.id||'';}
export function restoreTicketAssignment(user,connection,departments,people,primary){
 departments=departments.filter(d=>d.active!==false);
 const saved=readTicketPreferences(user).byConnection?.[connection];
 const department=departments.some(d=>d.id===saved?.department)?saved.department:departments.some(d=>d.id===primary)?primary:departments.length===1?departments[0].id:'';
 const sector=departments.find(d=>d.id===department);
 const owner=people.some(p=>p.id===saved?.owner&&(!department||sector?.users?.includes(p.id)))?saved.owner:'';
 return {department,owner,purpose:typeof saved?.purpose==='string'?saved.purpose.slice(0,500):'',message:typeof saved?.message==='string'?saved.message.slice(0,1000):''};
}
