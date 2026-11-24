// A HELENA marca como "Descartado" o contato que claramente não é um possível cliente
// (conversa pessoal/afetiva, spam, golpe, número errado, quem quer vender para a empresa...).
// É o mesmo registro que a equipe faz no painel, com origem "ai" para dar para conferir e desfazer.
const fail=message=>Object.assign(new Error(message),{status:400});
export const AI_DISCARD_REASONS=['Fora do perfil','Spam ou contato inválido','Produto não atendido','Região não atendida'];

export const DISCARD_TOOL={name:'descartar_lead',strict:true,
 description:'Marca este contato como lead descartado (não qualificado) quando ficar claro que ele não é um possível cliente: mensagens pessoais, afetivas ou românticas; correntes, propaganda, golpe ou pedido de dinheiro; número errado; pessoa oferecendo produtos/serviços ou procurando emprego; ou insistência em assunto sem relação com os produtos depois de você redirecionar uma vez. Não use para quem tem dúvida sobre os produtos, para cliente atual pedindo suporte nem para quem só disse "agora não". Depois de chamar, responda de forma curta e educada, sem dizer que o contato foi descartado.',
 input_schema:{type:'object',additionalProperties:false,properties:{
  motivo:{type:'string',enum:AI_DISCARD_REASONS,description:'Fora do perfil: conversa pessoal, afetiva ou sem relação com os produtos. Spam ou contato inválido: corrente, propaganda, golpe, número errado. Produto não atendido / Região não atendida: procura algo que não vendemos ou fora da área.'},
  observacao:{type:'string',description:'Uma frase factual e curta para a equipe, sem copiar dados pessoais do cliente. Ex.: "Mensagens afetivas sem relação com o sistema, mesmo após redirecionamento."'}},required:['motivo','observacao']}};

export const DISCARD_INSTRUCTIONS='\n\nLEAD NÃO QUALIFICADO: se ficar claro que o contato não é um possível cliente (mensagens pessoais, afetivas ou românticas; correntes, propaganda, golpe ou pedido de dinheiro; número errado; alguém oferecendo produtos/serviços ou procurando emprego; ou insistência em assunto sem relação com os produtos depois de você redirecionar uma vez), use descartar_lead com o motivo e uma observação curta. Na dúvida, redirecione uma vez para os produtos antes de descartar. Nunca descarte quem perguntou sobre produtos, preço ou funcionamento, nem cliente atual pedindo suporte. Depois de descartar, responda curto e educado, sem dizer que o contato foi descartado, e não insista em vender.';

export function validateDiscard(lead,input){
 if(!lead)throw fail('Contato não encontrado.');
 if(lead.salesQualification==='disqualified')return null;
 if(lead.salesQualification==='qualified'||lead.resultado==='ganho'||lead.crmDealId)throw fail('Este contato já foi qualificado ou tem negócio no CRM: não descarte. Continue normalmente.');
 if(lead.status==='encaminhado')throw fail('Atendimento com a equipe humana: não descarte. Continue normalmente.');
 if(lead.resultado==='apresentacao_agendada'||lead.agendamentoResumo)throw fail('Há apresentação agendada: não descarte. Continue normalmente.');
 const reason=String(input?.motivo||'').trim(),note=String(input?.observacao||'').replace(/\s+/g,' ').trim().slice(0,300);
 if(!AI_DISCARD_REASONS.includes(reason))throw fail('Use um dos motivos: '+AI_DISCARD_REASONS.join(', ')+'.');
 if(note.length<5)throw fail('Escreva uma observação curta para a equipe.');
 return {reason,note};
}

export async function discardByAi(store,phone,input){
 return store.transaction(async tx=>{
  const {rows:[row]}=await tx.pool.query('SELECT data FROM leads WHERE connection_id=$1 AND phone=$2 FOR UPDATE',[store.connectionId,phone]);
  const request=validateDiscard(row?.data,input);
  if(!request)return {already:true};
  await tx.updateLead(phone,{salesQualification:'disqualified',salesQualificationSource:'ai',salesQualificationReason:request.reason,salesQualificationNote:request.note,salesQualifiedAt:new Date().toISOString(),salesQualifiedBy:'HELENA',resultado:'perdido'});
  await tx.pool.query("UPDATE meta_conversion_events SET status='cancelled',detail='Lead descartado pela HELENA antes do envio.' WHERE connection_id=$1 AND phone=$2 AND status='queued' AND event_name='QualifiedLead'",[store.connectionId,phone]);
  await tx.pool.query("UPDATE cadence_queue SET status='stopped',reason='Lead descartado pela HELENA',updated_at=now() WHERE connection_id=$1 AND phone=$2 AND status IN ('waiting','queued','consent_required','awaiting_response','awaiting_delivery')",[store.connectionId,phone]);
  await tx.audit('sales_qualification_by_ai',null,{phone,status:'disqualified',reason:request.reason});
  return {discarded:true,...request};
 });
}
