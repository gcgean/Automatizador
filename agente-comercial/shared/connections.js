export const conversationKey=lead=>JSON.stringify([lead.connectionId||'default',lead.telefone]);
const palette=['#1476d4','#7c3aed','#0f8478','#be185d','#b45309','#4f46e5'];
export function connectionColor(connection){
 if(/^#[0-9a-f]{6}$/i.test(connection?.color||''))return connection.color;
 if(connection?.id==='default')return palette[0];
 if(connection?.id==='cilos-comercial')return palette[1];
 return palette[[...(connection?.id||'')].reduce((n,c)=>(n+c.charCodeAt(0))%palette.length,0)];
}
// Como mostrar o contato: @usuário no Instagram e no YouTube, +telefone no WhatsApp.
export const contactHandle=(lead,connection)=>connection?.channel==='youtube'?(lead?.youtubeHandle?'@'+lead.youtubeHandle:'YouTube'):connection?.channel==='instagram'?(lead?.instagramUsername?'@'+lead.instagramUsername:'Instagram'):'+'+(lead?.telefone||lead?.phone||'');
