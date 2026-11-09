import fs from 'node:fs/promises';
import {requestsOptOut} from './consent.js';
import {createProvider, PROVIDERS} from './llm.js';
import {CRM_TOOL} from './crm.js';
import {AGENDA_TOOL} from './agenda.js';

const nullableString = description => ({type: ['string', 'null'], description});

export const TOOLS = [
  {
    name: 'registrar_lead',
    description: 'Salva ou atualiza os dados de qualificação do cliente atual. Envie apenas os campos que você descobriu ou que mudaram; use null nos demais. Não avise o cliente que está registrando.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['nome', 'empresa', 'segmento', 'cidade', 'cargo', 'tamanho', 'sistema_atual', 'dor_principal', 'prazo', 'email', 'temperatura', 'observacoes', 'produtos_interesse'],
      properties: {
        nome: nullableString('Nome da pessoa.'),
        empresa: nullableString('Nome da empresa.'),
        segmento: nullableString('Ramo de atuação.'),
        cidade: nullableString('Cidade/estado.'),
        cargo: nullableString('Cargo ou papel na decisão.'),
        tamanho: nullableString('Número de funcionários ou unidades.'),
        sistema_atual: nullableString('Como fazem a gestão hoje.'),
        dor_principal: nullableString('Principal problema ou motivação.'),
        prazo: nullableString('Quando querem resolver.'),
        email: nullableString('E-mail informado pelo cliente.'),
        temperatura: {type: ['string', 'null'], enum: ['quente', 'morno', 'frio', null], description: 'Classificação do lead.'},
        observacoes: nullableString('Qualquer outra informação útil para o vendedor.'),
        produtos_interesse: nullableString('Produto(s) ou solução(ões) que o cliente demonstrou interesse em conhecer, usando os nomes do contexto.'),
      },
    },
  },
  {
    name: 'encaminhar_para_vendedor',
    description: 'Avisa o time comercial humano para assumir o contato: agendar a apresentação do sistema, uma reunião ou retornar a ligação. Use quando o cliente aceitar ou pedir contato humano.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['tipo', 'preferencia_horario', 'resumo'],
      properties: {
        tipo: {type: 'string', enum: ['apresentacao', 'reuniao', 'ligacao', 'retorno_outro_assunto'], description: 'O que o vendedor deve fazer.'},
        preferencia_horario: nullableString('Dia e horário preferidos pelo cliente, como ele falou.'),
        resumo: {type: 'string', description: 'Resumo curto para o vendedor: quem é, o que precisa, temperatura e próximos passos.'},
      },
    },
  },
];

const automationClosed=lead=>lead?.optedOut||['ganho','perdido'].includes(lead?.resultado);
const FALLBACK_TEXT = 'Obrigado pela mensagem! Um consultor da Command System vai continuar o seu atendimento em breve.';

export class SalesAgent {
  constructor({config, store, whatsapp, client, providerFactory, agenda, crm, cadence, media, log = console}) {
    this.config = config;
    this.store = store;
    this.whatsapp = whatsapp;
    this.agenda = agenda;
    this.crm=crm;this.cadence=cadence;this.media=media;
    this.log = log;
    this.queues = new Map();
    this.system = null;
    this.providers = new Map();
    this.providerFactory = providerFactory ?? (name => createProvider(name, {anthropicClient: client}));
  }

  // Provedor ativo: o escolhido em /config (data/config.json) ou AI_PROVIDER do .env.
  async getProvider() {
    const settings = await this.store.getSettings();
    const name = settings.aiProvider || this.config.aiProvider;
    if (!PROVIDERS.includes(name)) throw new Error(`Provedor de IA inválido: ${name}`);
    if (!this.providers.has(name)) this.providers.set(name, this.providerFactory(name));
    return this.providers.get(name);
  }

  async getSystem() {
    if(this.store.scoped){const c=await this.store.getConnection();return c.contextBody+'\n\nDiretrizes da plataforma: Seu nome é IARA. Não use a expressão assistente virtual. Se perguntarem sobre sua natureza, responda com transparência que é uma IA. Converse naturalmente, sem questionário: uma pergunta útil por vez, aproveite o que o cliente já contou, entenda produto e necessidade e convide para apresentação quando houver interesse. Não invente preços, funcionalidades ou disponibilidade. Use registrar_lead para salvar apenas fatos informados e classificar temperatura quando houver evidência: quente=pedido de apresentação, proposta ou intenção concreta; morno=interesse em produto sem próximo passo aceito; frio=sem interesse explícito ou sem aderência; não presumir classificação sem evidência. Não declare venda fechada nem agendamento confirmado sem confirmação humana. Não prometa lançamento em CRM externo, pois essa integração ainda não existe.';}
    if (!this.system) this.system = await fs.readFile(this.config.scriptFile, 'utf8');
    const settings = await this.store.getSettings();
    return this.system + (settings.context ? '\n\nOrientações adicionais do operador:\n' + settings.context : '');
  }

  // Mensagens do mesmo cliente são tratadas em fila, uma de cada vez.
  enqueue(message) {
    const previous = this.queues.get(message.from) ?? Promise.resolve();
    const next = previous.catch(() => {}).then(() => this.handle(message));
    this.queues.set(message.from, next);
    const cleanup = () => { if (this.queues.get(message.from) === next) this.queues.delete(message.from); };
    next.then(cleanup, cleanup);
    return next;
  }

  async syncCrm(phone){if(this.crm)try{await this.crm.enqueue(this.store.connectionId,phone);}catch{this.log.error('[crm]','Falha ao registrar sincronização pendente.');}}

  async afterReply(phone,text,inboundId){await this.syncCrm(phone);if(this.cadence)try{await this.cadence.arm(this.store.connectionId,phone,text,inboundId);}catch{this.log.error('[cadência]','Falha ao programar acompanhamento.');}}

  async handle({id, from, name, text, manual = false, followup, media, attachmentId, type, operator}) {
    if(followup){if(!this.cadence)throw new Error('Cadência indisponível.');return this.cadence.deliver(this,from,followup.attemptId);}
    const controlBefore=(await this.store.listLeads())[from]?.humanControlId;
    const suppressed=async()=>{const current=(await this.store.listLeads())[from];return automationClosed(current)||current?.humanControlId!==controlBefore;};
    const conv = await this.store.getConversation(from);
    if (conv.processedIds.includes(id)) return null;
    if (manual) {
      if ((await this.store.listLeads())[from]?.optedOut) throw new Error('Contato bloqueado por descadastro.');
      const events = await this.store.getEvents(from);
      if (!events.some(event => event.direction === 'in' && Date.now() - Date.parse(event.at) < 86400000)) throw new Error('Janela de atendimento encerrada.');
      if(attachmentId){if(!this.media)throw new Error('Envio de anexo indisponível.');await this.media.send(this,from,attachmentId);}else await this.whatsapp.sendText(from, text,{actor:'human',...(operator?{operatorId:operator.id,operatorName:operator.name,signed:operator.signed}:{})});
      // Ao retomar a IA, o próximo turno recebe o atendimento humano como contexto.
      conv.pendingHuman ??= [];
      conv.pendingHuman.push({id, text: 'Resposta do operador: ' + text, receivedAt: new Date().toISOString()});
      conv.processedIds.push(id);
      await this.store.saveConversation(conv);
      await this.syncCrm(from);return text;
    }
    this.whatsapp.markRead(id).catch(() => {});
    await this.store.recordEvent({id, phone: from, direction: 'in', actor:'client', text});
    let attachment;
    if(media&&this.media){await this.store.updateLead(from,name?{nomeWhatsApp:name}:{});attachment=await this.media.receive(this.store.connectionId,from,id,media,async a=>this.store.recordEvent({id,phone:from,direction:'in',actor:'client',text,type,attachment:this.media.public(a)}));if(attachment.transcript)text=attachment.transcript;await this.store.recordEvent({id,phone:from,direction:'in',actor:'client',text,type,attachment:this.media.public(attachment)});}
    if (requestsOptOut(text)) {
      await this.store.updateLead(from, {optedOut: true, status: 'bloqueado', optedOutAt: new Date().toISOString()});
    }

    if(this.cadence)await this.cadence.inbound(this.store.connectionId,from,text);
    const lead = await this.store.updateLead(from, name ? {nomeWhatsApp: name} : {});

    if (lead?.optedOut || lead?.status === 'encaminhado' || ['ganho','perdido'].includes(lead?.resultado)) {
      conv.pendingHuman ??= [];
      conv.pendingHuman.push({id, text, receivedAt: new Date().toISOString()});
      conv.processedIds.push(id);
      await this.store.saveConversation(conv);
      if(!lead?.optedOut)await this.syncCrm(from);return null;
    }

    if(attachment&&['audio','video'].includes(attachment.kind)&&!attachment.transcript){const reply='Recebi seu arquivo. Vou pedir à equipe para conferir o conteúdo e continuar seu atendimento.';await this.store.updateLead(from,{status:'encaminhado',motivoEncaminhamento:'conferir_midia'});await this.whatsapp.sendText(from,reply,{actor:'system'});conv.processedIds.push(id);await this.store.saveConversation(conv);return reply;}

    if(this.agenda){
      let scheduled;
      try{scheduled=await this.agenda.intercept(this.store.connectionId,from,text,id);}catch(error){this.log.error('[agenda]',error.message);await this.store.updateLead(from,{status:'encaminhado',motivoEncaminhamento:'falha_agenda'});scheduled={reply:'Não consegui consultar a agenda agora. A equipe vai conferir os horários e continuar seu atendimento.'};}
      if(scheduled?.reply){
        if(await suppressed()){conv.processedIds.push(id);await this.store.saveConversation(conv);return null;}
        await this.whatsapp.sendText(from,scheduled.reply,{actor:'ai',provider:'agenda'});
        await this.agenda.markSent(this.store.connectionId,from,id);
        const settings=await this.store.getSettings(),provider=settings.aiProvider||this.config.aiProvider;
        (conv.histories[provider]??=[]).push({role:'user',content:text},{role:'assistant',content:scheduled.reply});
        conv.processedIds.push(id);await this.store.saveConversation(conv);await this.afterReply(from,scheduled.reply,id);return scheduled.reply;
      }
    }

    let reply = null;
    let provider,activeHistory,turnBoundary;
    try {
      provider = await this.getProvider();
    } catch (error) {
      this.log.error('[ia]', error.message);
    }

    if (provider) {
      // Cada provedor guarda o histórico no próprio formato. Ao trocar de IA, a conversa recomeça
      // nesse provedor com os dados do lead já coletados.
      const messages = (conv.histories[provider.name] ??= []);
      const intro = messages.length === 0 ? introFor(name, lead) : '';
      const humanContext = conv.pendingHuman?.length ? '\nHistórico durante atendimento humano:\n' + conv.pendingHuman.map(item => item.text).join('\n') + '\nMensagem atual do cliente:\n' : '';
      messages.push({role: 'user', content: intro + humanContext + text});
      conv.pendingHuman = [];
      const turnStart = messages.length;activeHistory=messages;turnBoundary=turnStart;
      try {
        reply = await this.runTurn(from, provider, messages,{id,text,transcribed:!!attachment?.transcript,controlBefore});
      } catch (error) {
        this.log.error(`[${provider.name}]`, from, error.message);
      }
      // Um turno com falha pode deixar uma chamada de ferramenta sem resultado: descarta o turno
      // incompleto e mantém a mensagem do cliente para a próxima tentativa.
      if (!reply) messages.length = turnStart;
      conv.lastProvider = provider.name;
    }
    if(await suppressed()){if(activeHistory)activeHistory.length=turnBoundary;conv.processedIds.push(id);await this.store.saveConversation(conv);return null;}
    await this.store.saveConversation(conv);

    if (!reply) {
      reply = this.store.scoped&&this.store.connectionId!=='default'?'Obrigado pela mensagem! A equipe comercial vai continuar o seu atendimento em breve.':FALLBACK_TEXT;
      await this.store.updateLead(from, {status: 'encaminhado', motivoEncaminhamento: 'falha_ia'});
      await this.notifySeller(from, `Atenção: o assistente não conseguiu responder ${from}. Assuma a conversa.`);
    }
    if (await suppressed()) return null;
    await this.whatsapp.sendText(from, reply,{actor:provider?'ai':'system',provider:provider?.name});
    if(this.agenda)await this.agenda.markSent(this.store.connectionId,from,id);
    conv.processedIds.push(id);
    await this.store.saveConversation(conv);
    await this.afterReply(from,reply,id);return reply;
  }

  // Executa um turno do agente. O histórico só recebe acréscimos (a resposta completa do provedor),
  // o que mantém válidos os blocos de raciocínio do Claude entre turnos.
  async runTurn(from, provider, messages,turn={}) {
    const agendaEnabled=this.agenda&&await this.agenda.enabled(this.store.connectionId);
    const crmEnabled=this.crm&&await this.crm.enabled(this.store.connectionId);
    const mediaInstructions=this.media?'\n\nCAPACIDADES ATUAIS DE MÍDIA: A plataforma transcreve áudios e a fala de vídeos. Quando a mensagem atual for uma transcrição, use esse texto como a fala do cliente e responda normalmente. Respostas antigas dizendo que você não recebe transcrição são limitações antigas e não descrevem a configuração atual. Não diga que não consegue ouvir ou que o áudio chegou sem transcrição quando o texto foi fornecido. Se o cliente estiver testando áudio, confirme que recebeu e entendeu o conteúdo, sem inventar informações. Imagens e documentos ainda não são analisados visualmente; não invente seu conteúdo.':'';
    const currentMedia=turn.transcribed?'\nMENSAGEM ATUAL: foi recebida em áudio/vídeo e TRANSCRITA COM SUCESSO. O conteúdo da última mensagem do usuário é a transcrição. Responda ao conteúdo transcrito; não peça que o cliente o repita em texto.':'';
    const system = await this.getSystem()+mediaInstructions+currentMedia+(agendaEnabled?await this.agenda.instructions(this.store.connectionId):'')+(crmEnabled?await this.crm.instructions(this.store.connectionId):'');
    const tools=[...TOOLS,...(agendaEnabled?[AGENDA_TOOL]:[]),...(crmEnabled?[CRM_TOOL]:[])];
    for (let round = 0; round < 6; round++) {
      if(Object.hasOwn(turn,'controlBefore')&&(await this.store.listLeads())[from]?.humanControlId!==turn.controlBefore)return null;
      const result = await provider.complete({system, tools, messages});
      messages.push(...result.append);

      if (result.refused) {
        this.log.warn(`[${provider.name}] recusa`, from, result.refusalCategory);
        return null;
      }
      if (!result.toolCalls.length) return result.text || null;

      const results = [];
      let agendaReply=null;
      for (const call of result.toolCalls) {
        if(Object.hasOwn(turn,'controlBefore')&&(await this.store.listLeads())[from]?.humanControlId!==turn.controlBefore)return null;
        try {
          if(agendaReply&&!['registrar_lead','identificar_interacao_comercial'].includes(call.name)){results.push({id:call.id,content:'Horários já oferecidos neste turno. Aguarde a escolha do cliente.'});continue;}
          const content=await this.runTool(from, call.name, call.input ?? {},turn);
          if(content&&typeof content==='object'&&typeof content.agendaReply==='string'){agendaReply=content.agendaReply;results.push({id:call.id,content:agendaReply});}
          else results.push({id: call.id, content});
        } catch (error) {
          results.push({id: call.id, content: error.message, isError: true});
        }
      }
      messages.push(...provider.toolResults(results));
      if(agendaReply){messages.push({role:'assistant',content:agendaReply});return agendaReply;}
    }
    return null;
  }

  async runTool(from, name, input,turn={}) {
    if(name==='identificar_interacao_comercial'){if(!this.crm)throw new Error('CRM indisponível.');return this.crm.qualify(this.store.connectionId,from,input,turn);}
    if(name==='consultar_horarios_apresentacao'){
      if(!this.agenda||!turn.id)throw new Error('Agenda indisponível nesta conversa.');
      const result=await this.agenda.consult(this.store.connectionId,from,input,turn.id);return {agendaReply:result.reply};
    }
    if (name === 'registrar_lead') {
      const allowed = TOOLS[0].input_schema.properties;
      for (const [field, value] of Object.entries(input)) {
        if (!Object.hasOwn(allowed, field) || value !== null && typeof value !== 'string') throw new Error('Campo de lead inválido: ' + field);
        if (field === 'temperatura' && !allowed.temperatura.enum.includes(value)) throw new Error('Temperatura inválida.');
      }
      const lead = await this.store.updateLead(from, input);
      return `Lead atualizado. Status: ${lead.status}.`;
    }
    if (name === 'encaminhar_para_vendedor') {
      if(input.tipo==='apresentacao'&&this.agenda&&await this.agenda.enabled(this.store.connectionId)&&!/humano|pessoa|falar com (o |um |a |uma )?(vendedor|atendente|consultor)/i.test(turn.text||'')){
        const result=await this.agenda.consult(this.store.connectionId,from,{periodo:'qualquer'},turn.id);return {agendaReply:result.reply};
      }
      if (!TOOLS[1].input_schema.properties.tipo.enum.includes(input.tipo) || typeof input.resumo !== 'string' || !input.resumo.trim() || input.preferencia_horario !== null && typeof input.preferencia_horario !== 'string') {
        throw new Error('Encaminhamento inválido.');
      }
      const lead = await this.store.updateLead(from, {
        status: 'encaminhado',
        encaminhamento: input.tipo,
        preferenciaHorario: input.preferencia_horario,
        resumoParaVendedor: input.resumo,
        encaminhadoEm: new Date().toISOString(),
      });
      const notified = await this.notifySeller(from, sellerMessage(lead, input));
      return notified
        ? 'Vendedor avisado. Confirme ao cliente que um consultor vai entrar em contato para confirmar o horário. Finalize sem fazer novas perguntas.'
        : 'Lead marcado como encaminhado; o time comercial verá no painel. Confirme ao cliente que um consultor vai entrar em contato. Finalize sem fazer novas perguntas.';
    }
    throw new Error(`Ferramenta desconhecida: ${name}`);
  }

  // O aviso só chega se o vendedor tiver conversado com o número comercial nas últimas 24h
  // (regra da janela de atendimento da Meta). Falhas são registradas e não interrompem o cliente.
  async notifySeller(from, text) {
    let ok = false;
    for (const seller of this.config.sellerNumbers) {
      try {
        await this.whatsapp.sendText(seller, text,{actor:'system'});
        ok = true;
      } catch (error) {
        this.log.warn('[vendedor] não foi possível avisar', seller, error.message);
      }
    }
    return ok;
  }
}

const LEAD_LABELS = {nome: 'Nome', empresa: 'Empresa', segmento: 'Segmento', cidade: 'Cidade', cargo: 'Cargo', tamanho: 'Tamanho', sistema_atual: 'Sistema atual', dor_principal: 'Dor principal', prazo: 'Prazo', email: 'E-mail', temperatura: 'Temperatura', status: 'Status'};

function introFor(name, lead) {
  const lines = [];
  if (name) lines.push(`Nome no perfil do WhatsApp: ${name}`);
  const known = Object.entries(LEAD_LABELS).filter(([key]) => lead?.[key] && !(key === 'status' && lead.status === 'em_conversa'));
  if (known.length) lines.push(`Dados já coletados deste cliente em conversas anteriores: ${known.map(([k, label]) => `${label}: ${lead[k]}`).join('; ')}`);
  return lines.length ? `[${lines.join(' | ')}]\n` : '';
}

function sellerMessage(lead, input) {
  const tipos = {apresentacao: 'Apresentação do sistema', reuniao: 'Reunião', ligacao: 'Ligação', retorno_outro_assunto: 'Retorno (outro assunto)'};
  const linhas = [
    `🔔 Novo lead do WhatsApp comercial — ${tipos[input.tipo] ?? input.tipo}`,
    `Contato: +${lead.telefone}${lead.nome || lead.nomeWhatsApp ? ` (${lead.nome || lead.nomeWhatsApp})` : ''}`,
    lead.empresa && `Empresa: ${lead.empresa}${lead.segmento ? ` · ${lead.segmento}` : ''}${lead.cidade ? ` · ${lead.cidade}` : ''}`,
    lead.cargo && `Cargo: ${lead.cargo}`,
    lead.tamanho && `Tamanho: ${lead.tamanho}`,
    lead.sistema_atual && `Hoje usa: ${lead.sistema_atual}`,
    lead.dor_principal && `Dor: ${lead.dor_principal}`,
    lead.prazo && `Prazo: ${lead.prazo}`,
    lead.email && `E-mail: ${lead.email}`,
    lead.temperatura && `Temperatura: ${lead.temperatura}`,
    input.preferencia_horario && `Preferência: ${input.preferencia_horario}`,
    `Resumo: ${input.resumo}`,
    `Abrir conversa: https://wa.me/${lead.telefone}`,
  ];
  return linhas.filter(Boolean).join('\n');
}
