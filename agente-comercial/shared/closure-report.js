const cell=value=>{
 let text=String(value??'');
 if(/^[\s\u0000-\u001f]*[=+@-]/.test(text)||/^[\t\r]/.test(text))text="'"+text;
 return '"'+text.replace(/"/g,'""')+'"';
};
export function closureReportCsv(rows){
 const headers=['Chamado','Finalizado em (UTC)','Cliente','Contato','Conexão','Setor','Finalizado por','Responsável','Resultado comercial','Produto','Motivos','Observação','ID do anúncio Meta'];
 return '\ufeff'+[headers,...rows.map(r=>[r.ticketId,r.closedAt,r.name,r.phone,r.connectionName,r.departmentName,r.closedBy,r.assignedUserName,r.outcome,r.product,(r.reasons||[]).join(' / '),r.note,r.adId])].map(row=>row.map(cell).join(';')).join('\r\n');
}
