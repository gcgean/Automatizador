// Catálogo único de alertas: rótulo (sino e painel), texto do Telegram e quem recebe por padrão.
// seller/manager: marcados por padrão para vendedor/gestor ao vincular no Telegram.
// optIn: só é gerado para quem escolheu receber (evita encher o sino de quem não quer).
export const ALERT_TYPES=[
 {id:'assignment',group:'Atendimento',label:'Lead atribuído a você',hint:'Um novo atendimento foi passado para a pessoa.',seller:true,manager:true,telegram:'Um novo lead foi vinculado a você. Abra o atendimento para responder.'},
 {id:'waiting_reply',group:'Atendimento',label:'Cliente aguardando há 15 minutos',hint:'Cliente sem resposta do responsável em horário comercial.',seller:false,manager:false,telegram:'Um cliente está aguardando sua resposta há 15 minutos. A HELENA deixou uma sugestão no atendimento.'},
 {id:'client_waiting',group:'Atendimento',label:'Cliente esperando há 2 horas',hint:'Ninguém da equipe respondeu o cliente em 2 horas.',seller:true,manager:true,telegram:'Um cliente está esperando resposta da equipe há mais de 2 horas. Abra o atendimento para responder.'},
 {id:'schedule_request',group:'Atendimento',label:'Pedido de horário',hint:'Cliente pediu ou confirmou um horário com a equipe.',seller:true,manager:true,telegram:'Um cliente pediu ou confirmou um horário. Abra o atendimento e confirme na agenda.'},
 {id:'reply_suggestion',group:'Atendimento',label:'Sugestão de resposta da HELENA',hint:'A HELENA preparou uma resposta para o atendente revisar.',seller:false,manager:false,optIn:true,telegram:'A HELENA deixou uma sugestão de resposta num atendimento seu. Abra para revisar e enviar.'},
 {id:'support_request',group:'Atendimento',label:'Pedido de suporte técnico',hint:'Cliente pediu ajuda técnica.',seller:true,manager:true,telegram:'Um cliente solicitou suporte técnico. Abra o atendimento para conferir o pedido.'},
 {id:'new_lead',group:'Vendas',label:'Novo lead falando com a HELENA',hint:'Um contato novo começou a conversar.',seller:false,manager:false,telegram:'Um novo lead começou a conversar com a HELENA. Abra a plataforma para acompanhar.'},
 {id:'link_sent',group:'Vendas',label:'Lead recebeu link de produto',hint:'Em horário comercial; bom momento para puxar conversa.',seller:true,manager:false,telegram:'Um lead acabou de receber o link de uma solução. Bom momento para falar com ele: abra o atendimento e puxe conversa.'},
 {id:'product_activity',group:'Vendas',label:'Cadastro ou uso de produto',hint:'O cliente se cadastrou ou usou o produto.',seller:true,manager:true,telegram:'Há uma atualização de cadastro ou uso de um produto. Abra o atendimento para acompanhar.'},
 {id:'sales_priority',group:'Gestão',label:'Cliente pediu atendimento humano',hint:'Pedido urgente para falar com uma pessoa.',seller:false,manager:true,telegram:'Um cliente pediu atendimento humano agora. Abra o painel para assumir.'},
 {id:'sales_overdue',group:'Gestão',label:'Prazo comercial vencido',hint:'Pedido de atendimento humano passou do prazo.',seller:false,manager:true,telegram:'Um atendimento comercial ultrapassou o prazo. Abra o painel para conferir.'},
 {id:'lead_discarded',group:'Gestão',label:'Lead descartado pela HELENA',hint:'Contato fora do perfil ou do assunto foi descartado.',seller:false,manager:false,optIn:true,telegram:'A HELENA descartou um contato como lead não qualificado. Abra para conferir se concorda.'},
 {id:'page_request',group:'Gestão',label:'Página que falta no site',hint:'A HELENA não encontrou página para a necessidade do cliente.',seller:false,manager:true,telegram:null},
];
export const ALERT_IDS=ALERT_TYPES.map(a=>a.id);
export const alertType=kind=>ALERT_TYPES.find(a=>a.id===kind)||null;
export const alertLabel=kind=>alertType(kind)?.label||'Novo lead vinculado a você';
export const defaultKinds=manager=>ALERT_TYPES.filter(a=>manager?a.manager:a.seller).map(a=>a.id);
// Escolha salva vale; sem escolha (vínculos antigos), usa o padrão pelo perfil.
export const recipientKinds=r=>Array.isArray(r?.kinds)?r.kinds.filter(k=>ALERT_IDS.includes(k)):defaultKinds(!!r?.manager);
