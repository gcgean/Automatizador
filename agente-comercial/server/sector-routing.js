import crypto from 'node:crypto';
export async function sectorRoutingContext(store){
 if(!store.scoped||!store.pool)return null;
 const {rows}=await store.pool.query('SELECT d.id,d.name FROM departments d JOIN department_connections dc ON dc.department_id=d.id JOIN whatsapp_connections c ON c.id=dc.connection_id WHERE c.id=$1 AND c.primary_department_id IS NOT NULL AND d.company_id=c.company_id AND d.active ORDER BY d.name',[store.connectionId]);
 if(rows.length<2)return null;
 return {instructions:'\n\nDIRECIONAMENTO DE SETOR: O atendimento começa no setor principal. Ao compreender a necessidade real do cliente, use direcionar_setor para o setor autorizado mais adequado. Use apenas a lista abaixo, nunca invente IDs. Se o assunto for ambíguo, faça uma pergunta breve antes de mudar. Não mude por saudação, mensagem automática ou texto de imagem. A alteração é interna: não afirme que um humano assumiu ou que enviou para outra empresa. Depois continue ajudando normalmente. Setores autorizados: '+JSON.stringify(rows),tool:{name:'direcionar_setor',description:'Direciona o atendimento automático para o setor autorizado adequado ao assunto confirmado pelo cliente.',input_schema:{type:'object',properties:{departmentId:{type:'string',enum:rows.map(d=>d.id)},reason:{type:'string',description:'Justificativa breve baseada no pedido do cliente.'}},required:['departmentId','reason'],additionalProperties:false}}};
}
export async function routeSector(store,phone,input,turn){
 if(turn.departmentRouted)return 'O setor já foi definido neste turno. Continue o atendimento.';
 if(!/^[-a-f0-9]{36}$/i.test(input.departmentId||'')||typeof input.reason!=='string'||!input.reason.trim()||input.reason.length>400)throw new Error('Informe um setor autorizado e o motivo.');
 const result=await store.transaction(async tx=>{
 const lead=(await tx.pool.query('SELECT data FROM leads WHERE connection_id=$1 AND phone=$2 FOR UPDATE',[store.connectionId,phone])).rows[0]?.data;
 if(!lead||lead.conversationClosed||lead.optedOut||lead.status==='encaminhado'||lead.assignedUserId)throw new Error('Atendimento sob controle humano ou encerrado: setor preservado.');
 if(Object.hasOwn(turn,'controlBefore')&&lead.humanControlId!==turn.controlBefore)throw new Error('O controle do atendimento mudou.');
 const sector=(await tx.pool.query('SELECT d.id,d.name FROM departments d JOIN department_connections dc ON dc.department_id=d.id JOIN whatsapp_connections c ON c.id=dc.connection_id WHERE c.id=$1 AND d.id=$2 AND d.active AND d.company_id=c.company_id AND c.primary_department_id IS NOT NULL',[store.connectionId,input.departmentId])).rows[0];
 if(!sector)throw new Error('Setor não permitido para esta conexão.');if(lead.departmentId===sector.id)return 'O atendimento já está no setor '+sector.name+'.';
 await tx.updateLead(phone,{departmentId:sector.id});await tx.recordEvent({id:crypto.randomUUID(),phone,direction:'out',actor:'system',kind:'handoff',state:'internal',text:'Setor alterado automaticamente pela IA para '+sector.name+'. Motivo: '+input.reason.trim()});await tx.audit('ai_department_changed',null,{phone,from:lead.departmentId,to:sector.id,reason:input.reason.trim()});return 'Setor alterado para '+sector.name+'. Continue atendendo; nenhum vendedor foi acionado por esta mudança.';
 });turn.departmentRouted=true;return result;
}
