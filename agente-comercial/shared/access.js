export const PERMISSION_SECTIONS=[
 {name:'Atendimento',items:[['conversations.view','Ver conversas e contatos'],['messages.send','Enviar mensagens de texto'],['calls.use','Fazer e receber ligações WhatsApp'],['media.send','Enviar áudios e anexos'],['signature.choose','Escolher enviar com ou sem assinatura'],['conversations.automation','Pausar e retomar a IA'],['conversations.transfer','Transferir para atendente humano'],['leads.manage','Classificar leads, etiquetas e encerramentos'],['contacts.block','Bloquear contatos'],['photos.manage','Cadastrar foto do contato'],['queue.resolve','Resolver pendências de envio'],['deals.manage','Atualizar e fechar negócios no CRM']]},
 {name:'Análise',items:[['reports.view','Ver relatórios'],['reports.export','Exportar mensagens'],['learning.manage','Analisar e aprovar melhorias da IA']]},
 {name:'Configurações',items:[['ai.manage','Escolher provedor de IA'],['agenda.manage','Configurar agenda e conferir reservas'],['crm.manage','Configurar CRM e conferir sincronização'],['cadence.manage','Configurar cadência'],['simulation.use','Testar IARA e integrações']]}
];
export const ALL_PERMISSIONS=PERMISSION_SECTIONS.flatMap(s=>s.items.map(i=>i[0]));
export const LEGACY_PERMISSIONS={viewer:['conversations.view','reports.view','reports.export'],operator:['calls.use','conversations.view','messages.send','media.send','signature.choose','conversations.automation','conversations.transfer','leads.manage','contacts.block','photos.manage','queue.resolve','deals.manage','reports.view','reports.export']};
export const can=(user,key)=>user?.role==='admin'||(user?.permissions||LEGACY_PERMISSIONS[user?.role]||[]).includes(key);
export function requiredPermission(path,method){
 if(path==='/tags')return method==='GET'?'conversations.view':'leads.manage';
 if(/^\/leads\/\d+\/tags$/.test(path))return 'leads.manage';
 if(path.startsWith('/calls'))return path==='/calls/settings'&&method==='POST'?'admin':'calls.use';
 if(path.startsWith('/reports'))return path.endsWith('.csv')?'reports.export':'reports.view';
 if(/^\/(users|access-groups)(\/|$)/.test(path))return 'admin';
 if(/^\/(contexts|context)(\/|$)/.test(path)||path.startsWith('/connections/')||path==='/connections'&&method==='POST')return 'admin';
 if(path.startsWith('/learning'))return 'learning.manage';if(path.startsWith('/simulation'))return 'simulation.use';if(path.startsWith('/crm'))return 'crm.manage';if(path.startsWith('/cadence'))return 'cadence.manage';if(path.startsWith('/agenda'))return 'agenda.manage';
 if(path==='/attendants')return 'conversations.transfer';if(/^\/leads\/\d+\/transfer$/.test(path))return 'conversations.transfer';
 if(path==='/config')return method==='POST'?'ai.manage':null;if(path==='/connections')return null;
 if(method==='GET'&&(path==='/leads'||path==='/inbox'||/^\/(conversations|media)\//.test(path)||/^\/leads\/\d+\/deal$/.test(path)))return 'conversations.view';
 if(path==='/inbox/resolve'||path==='/inbox/cancel')return 'queue.resolve';
 if(/^\/leads\/\d+\/reply$/.test(path))return 'messages.send';if(/^\/leads\/\d+\/media$/.test(path))return 'media.send';if(/^\/leads\/\d+\/avatar/.test(path))return 'photos.manage';if(/^\/leads\/\d+\/deal\//.test(path))return 'deals.manage';if(/^\/leads\/\d+\/(state|qualify)$/.test(path))return 'leads.manage';if(/^\/leads\/\d+\/automation$/.test(path))return 'conversations.automation';if(/^\/leads\/\d+\/block$/.test(path))return 'contacts.block';return 'admin';
}
