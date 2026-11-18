// A HELENA finaliza o atendimento quando a conversa terminou, com um ou mais motivos.
// Usa os motivos cadastrados; se nenhum servir, cria um motivo curto (marcado como criado pela IA).
import crypto from 'node:crypto';
import {companyOf,recordClosureReasons} from './closure-reasons.js';
const fail=message=>Object.assign(new Error(message),{status:400});
const normalize=text=>String(text||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase().replace(/[^a-z0-9 ]+/g,' ').replace(/\s+/g,' ').trim();
const MAX_REASONS=3,MAX_NEW=2,COMPANY_LIMIT=80;

export const CLOSE_TOOL={name:'encerrar_atendimento',strict:true,
 description:'Finaliza este atendimento quando a conversa estiver concluída (cliente agradeceu ou se despediu com a dúvida resolvida, disse que não precisa de mais nada agora ou recusou seguir). Informe de 1 a 3 motivos, preferindo os já cadastrados. A finalização acontece depois da sua mensagem final; depois de chamar, envie uma despedida curta.',
 input_schema:{type:'object',additionalProperties:false,properties:{
  motivos:{type:'array',items:{type:'string'},description:'De 1 a 3 motivos. Use o nome exato de um motivo cadastrado; crie um novo só se nenhum servir (2 a 4 palavras, genérico, sem nome do cliente).'},
  resumo:{type:'string',description:'Uma frase factual sobre como a conversa terminou.'}},required:['motivos','resumo']}};

export async function closureInstructions(pool,connectionId){
 const companyId=await companyOf(pool,connectionId);
 const {rows}=await pool.query("SELECT name FROM closure_reasons WHERE company_id=$1 AND active AND COALESCE(system_key,'')<>'no_interaction' ORDER BY lower(name)",[companyId]);
 return '\n\nENCERRAMENTO DO ATENDIMENTO: quando a conversa estiver concluída, use encerrar_atendimento. Exemplos: o cliente agradeceu ou se despediu depois de ter a dúvida resolvida; disse que não precisa de mais nada agora; ou recusou seguir. NÃO encerre se o cliente fez uma pergunta ainda sem resposta, se você acabou de fazer uma pergunta e espera retorno, se há apresentação agendada ou se o cliente indicou que vai continuar a conversa. Escolha de 1 a 3 motivos. Motivos cadastrados: '+(rows.length?rows.map(r=>'"'+r.name+'"').join(', '):'nenhum')+'. Prefira estes nomes exatamente como estão. Só crie um motivo novo se nenhum servir, com nome curto e genérico (ex.: "Dúvida esclarecida"), sem dados do cliente. Depois de chamar a ferramenta, envie uma despedida curta e cordial, sem dizer que o atendimento foi encerrado no sistema.';
}

// Confere o pedido de encerramento durante o turno; o encerramento em si só ocorre depois da despedida.
export function validateCloseRequest(lead,input){
 if(!lead)throw fail('Contato não encontrado.');
 if(lead.conversationClosed)throw fail('Este atendimento já está finalizado.');
 if(lead.status==='encaminhado')throw fail('Atendimento com a equipe humana: não encerre. Continue normalmente.');
 if(lead.resultado==='apresentacao_agendada'||lead.agendamentoResumo)throw fail('Há apresentação agendada: não encerre. Despeça-se normalmente.');
 const seen=new Set(),names=(Array.isArray(input?.motivos)?input.motivos:[]).map(n=>String(n||'').trim().replace(/\s+/g,' ').replace(/[.;:!]+$/,'')).filter(n=>n.length>=3&&n.length<=60&&!/\d{6,}/.test(n)&&!seen.has(normalize(n))&&seen.add(normalize(n))).slice(0,MAX_REASONS);
 if(!names.length)throw fail('Informe de 1 a 3 motivos curtos.');
 return {names,summary:String(input?.resumo||'').trim().slice(0,500)};
}

export async function resolveReasons(db,companyId,names){
 const {rows}=await db.query('SELECT id,name,active FROM closure_reasons WHERE company_id=$1',[companyId]);
 const byName=new Map(rows.map(r=>[normalize(r.name),r]));let created=0,total=rows.filter(r=>r.active).length;const out=[];
 for(const name of names){
  const found=byName.get(normalize(name));
  if(found){if(found.active)out.push({id:found.id,name:found.name,created:false});continue;}
  if(created>=MAX_NEW||total>=COMPANY_LIMIT)continue;
  const label=name.charAt(0).toUpperCase()+name.slice(1);
  const {rows:[row]}=await db.query('INSERT INTO closure_reasons(id,company_id,name,created_by_ai) VALUES($1,$2,$3,true) ON CONFLICT DO NOTHING RETURNING id,name',[crypto.randomUUID(),companyId,label]);
  if(row){out.push({id:row.id,name:row.name,created:true});byName.set(normalize(label),{...row,active:true});created++;total++;}
 }
 return out;
}

export async function closeByAi(store,phone,{names,summary}){
 return store.transaction(async tx=>{
  const {rows:[row]}=await tx.pool.query('SELECT data FROM leads WHERE connection_id=$1 AND phone=$2 FOR UPDATE',[store.connectionId,phone]);
  if(!row||row.data.conversationClosed||row.data.status==='encaminhado'||row.data.resultado==='apresentacao_agendada')return null;
  const reasons=await resolveReasons(tx.pool,await companyOf(tx.pool,store.connectionId),names);if(!reasons.length)return null;
  const lead=await tx.updateLead(phone,{conversationClosed:true,conversationClosedAt:new Date().toISOString(),conversationClosedBy:'ai',conversationClosedByName:'HELENA',conversationClosedReason:'ai_concluded',conversationClosedReasonNames:reasons.map(r=>r.name),conversationClosedSummary:summary||false,humanControlId:crypto.randomUUID()});
  await recordClosureReasons(tx.pool,row.data.ticketId,reasons.map(r=>r.id));
  await tx.pool.query("UPDATE cadence_queue SET status='stopped',reason='Atendimento concluído pela HELENA',updated_at=now() WHERE connection_id=$1 AND phone=$2 AND status IN ('waiting','queued','consent_required','awaiting_response','awaiting_delivery')",[store.connectionId,phone]);
  await tx.audit('conversation_closed_by_ai',null,{phone,reasons:reasons.map(r=>r.name),created:reasons.filter(r=>r.created).map(r=>r.name),summary});
  return lead;
 });
}
