// Acompanhamento das conversas que estão com atendente humano:
// - cliente falou de horário: avisa o responsável na hora (ou os gestores, se não houver responsável);
// - cliente sem resposta da equipe há 2 horas (em expediente): avisa o responsável e os gestores (Telegram e sino);
// - 24 horas sem resposta da equipe: devolve a conversa para a HELENA e arma a cadência.
// A "resposta automática de apoio" não conta como resposta da equipe.
import crypto from 'node:crypto';
import {businessOpen} from './consultant-routing.js';
import {waitingTurn} from './support-assist.js';
const HOUR=3600000;
export const SCHEDULE_RE=/\b(?:horario|marcad[oa]s?|marcar|agendar|agendad[oa]|reagendar|remarcar|reuniao|apresentacao|amanha (?:as|a|de)|hoje (?:as|a)|\d{1,2}(?::\d{2})?\s?h(?:rs?|oras)?\b|\d{1,2}:\d{2})/;
// Confirmações curtas não pedem resposta ("ok", "obrigado", "combinado", emoji).
export const ACK_RE=/^(?:ok+|okay|blz|beleza|certo|ta bom|ta|show|perfeito|combinado|obrigad[oa]s?|obg|valeu|vlw|entendi|otimo|fechado|isso|sim|tudo bem|bom dia|boa tarde|boa noite|[\p{Extended_Pictographic}️‍\s!.]+)[\s!.]*$/u;
// Reações e mensagens automáticas do próprio cliente (ausência/boas-vindas da empresa dele) também não pedem resposta.
export const NO_REPLY_NEEDED=text=>{const t=norm(text).trim();return ACK_RE.test(t)||/^\[o cliente reagiu/.test(t)||/obrigad[oa] pelo (?:seu )?contato|mensagem automatica|resposta automatica|no momento (?:nao|estamos)|retornaremos (?:em breve|o mais breve)|nosso horario de atendimento/.test(t);};
const norm=s=>String(s||'').normalize('NFD').replace(/[̀-ͯ]/g,'').toLowerCase();
export function followupAction(turn,{open,escalated,scheduled,resumed,hasAppointment}){
 if(!turn)return null;
 if(!resumed&&!hasAppointment&&turn.wait>=24*HOUR)return 'resume';
 if(!scheduled&&turn.schedule)return 'schedule';
 if(!escalated&&open&&turn.wait>=2*HOUR)return 'escalate';
 return null;
}
export class HumanFollowup{
 constructor(store,registry,{cadence=null,now=()=>new Date(),log=console,dryRun=false}={}){Object.assign(this,{store,registry,cadence,now,log,dryRun});this.plan=[];}
 async init(){await this.store.pool.query('CREATE TABLE IF NOT EXISTS human_followups(ticket_id bigint NOT NULL,anchor_id text NOT NULL,escalated_at timestamptz,scheduled_at timestamptz,resumed_at timestamptz,PRIMARY KEY(ticket_id,anchor_id))');}
 tick(){if(this.running)return this.running;this.running=this.sweep().finally(()=>{this.running=null;});return this.running;}
 async sweep(){
  const {rows}=await this.store.pool.query(`SELECT t.id,t.connection_id,t.phone,t.assigned_user_id,c.company_id FROM service_tickets t JOIN whatsapp_connections c ON c.id=t.connection_id JOIN companies co ON co.id=c.company_id JOIN leads l ON l.connection_id=t.connection_id AND l.phone=t.phone WHERE t.closed_at IS NULL AND c.enabled AND co.active AND coalesce(c.channel,'whatsapp') IN ('whatsapp','instagram') AND l.data->>'status'='encaminhado' AND l.data->>'ticketId'=t.id::text AND coalesce((l.data->>'conversationClosed')::boolean,false)=false AND coalesce((l.data->>'optedOut')::boolean,false)=false AND coalesce(l.data->>'resultado','') NOT IN ('ganho','perdido')`);
  let done=0;for(const t of rows){try{if(await this.process(t))done++;}catch{this.log.error('[acompanhamento humano] Falha ao conferir um atendimento.');}}
  return done;
 }
 async managers(companyId){return (await this.store.pool.query("SELECT id FROM users WHERE company_id=$1 AND active AND role='admin'",[companyId])).rows.map(r=>r.id);}
 async notify(t,kind,users){for(const id of [...new Set(users)])await this.store.pool.query('INSERT INTO user_notifications(id,user_id,company_id,connection_id,phone,kind) VALUES($1,$2,$3,$4,$5,$6)',[crypto.randomUUID(),id,t.company_id,t.connection_id,t.phone,kind]);}
 async process(t){
  const scoped=this.store.scope(t.connection_id),lead=await scoped.getLead(t.phone);
  const events=(await scoped.getEvents(t.phone)).filter(e=>String(e.ticketId)===String(t.id));
  const turn=waitingTurn(events,this.now());if(!turn)return false;
  const anchorAt=Date.parse(events.find(x=>x.id===turn.anchor)?.at||0),pending=events.filter(e=>e.direction==='in'&&Date.parse(e.at)>=anchorAt);
  if(pending.every(e=>NO_REPLY_NEEDED(e.text)))return false;
  turn.schedule=SCHEDULE_RE.test(norm(pending.map(e=>e.text).join(' ')));
  if(this.dryRun){const row=(await this.store.pool.query('SELECT * FROM human_followups WHERE ticket_id=$1 AND anchor_id=$2',[t.id,turn.anchor]).catch(()=>({rows:[]}))).rows[0]||{};const settings=await this.registry.routing.settings(t.company_id);const action=followupAction(turn,{open:businessOpen({...settings,enabled:true},this.now()),escalated:!!row.escalated_at,scheduled:!!row.scheduled_at,resumed:!!row.resumed_at,hasAppointment:!!(lead?.agendamentoResumo||lead?.resultado==='apresentacao_agendada')});if(action)this.plan.push({action,phone:t.phone,nome:lead?.nome||lead?.nomeWhatsApp,responsavel:lead?.assignedUserName||null,horas:Math.round(turn.wait/HOUR),ultima:String(pending.at(-1)?.text||'').slice(0,80)});return false;}
  await this.store.pool.query('INSERT INTO human_followups(ticket_id,anchor_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[t.id,turn.anchor]);
  const row=(await this.store.pool.query('SELECT * FROM human_followups WHERE ticket_id=$1 AND anchor_id=$2',[t.id,turn.anchor])).rows[0];
  const settings=await this.registry.routing.settings(t.company_id);
  const responsible=t.assigned_user_id&&(await this.store.pool.query('SELECT 1 FROM users WHERE id=$1 AND active',[t.assigned_user_id])).rowCount?t.assigned_user_id:null;
  const action=followupAction(turn,{open:businessOpen({...settings,enabled:true},this.now()),escalated:!!row.escalated_at,scheduled:!!row.scheduled_at,resumed:!!row.resumed_at,hasAppointment:!!(lead?.agendamentoResumo||lead?.resultado==='apresentacao_agendada')});
  if(!action)return false;
  const claim=await this.store.pool.query(`UPDATE human_followups SET ${action==='resume'?'resumed_at':action==='schedule'?'scheduled_at':'escalated_at'}=now() WHERE ticket_id=$1 AND anchor_id=$2 AND ${action==='resume'?'resumed_at':action==='schedule'?'scheduled_at':'escalated_at'} IS NULL RETURNING ticket_id`,[t.id,turn.anchor]);
  if(!claim.rowCount)return false;
  if(action==='schedule'){await this.notify(t,'schedule_request',responsible?[responsible]:await this.managers(t.company_id));return true;}
  if(action==='escalate'){await this.notify(t,'client_waiting',[...(responsible?[responsible]:[]),...await this.managers(t.company_id)]);return true;}
  await scoped.transaction(async tx=>{
   const current=(await tx.pool.query('SELECT data FROM leads WHERE connection_id=$1 AND phone=$2 FOR UPDATE',[t.connection_id,t.phone])).rows[0]?.data;
   if(!current||current.status!=='encaminhado'||String(current.ticketId)!==String(t.id))return;
   await tx.updateLead(t.phone,{status:'em_conversa',assignedUserId:false,assignedUserName:false,humanControlId:crypto.randomUUID()});
   await tx.recordEvent({id:crypto.randomUUID(),phone:t.phone,direction:'out',actor:'system',kind:'handoff',state:'internal',text:'Atendimento devolvido à HELENA: o cliente ficou 24 horas sem resposta da equipe'+(current.assignedUserName?' (responsável anterior: '+current.assignedUserName+')':'')+'.'});
   await tx.audit('human_followup_resumed_ai',null,{phone:t.phone,ticketId:t.id,previous:current.assignedUserId||null});
  });
  try{await this.cadence?.arm(t.connection_id,t.phone,'Cliente sem resposta da equipe por 24 horas',turn.last);}catch{}
  return true;
 }
}
