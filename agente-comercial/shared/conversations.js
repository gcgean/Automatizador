export function inConversationGroup(lead,group,userId){
 if(group==='closed')return lead.conversationClosed===true;
 if(lead.conversationClosed)return false;
 if(group==='mine')return !!userId&&lead.assignedUserId===userId&&lead.status==='encaminhado'&&!['ganho','perdido'].includes(lead.resultado);
 if(group==='won')return lead.resultado==='ganho';
 if(group==='lost')return lead.resultado==='perdido';
 return !['ganho','perdido'].includes(lead.resultado)&&(group==='human'?lead.status==='encaminhado':lead.status!=='encaminhado');
}
