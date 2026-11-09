import fs from 'node:fs/promises';
import {createProvider, PROVIDERS} from './llm.js';

const nullableString = description => ({type: ['string', 'null'], description});

export const TOOLS = [
  {
    name: 'registrar_lead',
    description: 'Salva ou atualiza os dados de qualificação do cliente atual. Envie apenas os campos que você descobriu ou que mudaram; use null nos demais. Não avise o cliente que está registrando.',
    strict: true,
    input_schema: {
      type: 'object',
      additionalProperties: false,
      required: ['nome', 'empresa', 'segmento', 'cidade', 'cargo', 'tamanho', 'sistema_atual', 'dor_principal', 'prazo', 'email', 'temperatura', 'observacoes'],
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

const FALLBACK_TEXT = 'Obrigado pela mensagem! Um consultor da Command System vai continuar o seu atendimento em breve.';

export class SalesAgent {
  constructor({config, store, whatsapp, client, providerFactory, log = console}) {
    this.config = config;
    this.store = store;
    this.whatsapp = whatsapp;
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
    if (!this.system) this.system = await fs.readFile(this.config.scriptFile, 'utf8');
    return this.system;
  }

  // Mensagens do mesmo cliente são tratadas em fila, uma de cada vez.
  enqueue(message) {
    const previous = this.queues.get(message.from) ?? Promise.resolve();
    const next = previous.then(() => this.handle(message)).catch(error => this.log.error('[agente]', message.from, error));
    this.queues.set(message.from, next);
    next.finally(() => { if (this.queues.get(message.from) === next) this.queues.delete(message.from); });
    return next;
  }

  async handle({id, from, name, text}) {
    const conv = await this.store.getConversation(from);
    if (conv.processedIds.includes(id)) return null;
    conv.processedIds.push(id);
    this.whatsapp.markRead(id).catch(() => {});

    const lead = name ? await this.store.updateLead(from, {nomeWhatsApp: name}) : (await this.store.listLeads())[from];

    let reply = null;
    let provider;
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
      messages.push({role: 'user', content: intro + text});
      const turnStart = messages.length;
      try {
        reply = await this.runTurn(from, provider, messages);
      } catch (error) {
        this.log.error(`[${provider.name}]`, from, error.message);
      }
      // Um turno com falha pode deixar uma chamada de ferramenta sem resultado: descarta o turno
      // incompleto e mantém a mensagem do cliente para a próxima tentativa.
      if (!reply) messages.length = turnStart;
      conv.lastProvider = provider.name;
    }
    await this.store.saveConversation(conv);

    if (!reply) {
      reply = FALLBACK_TEXT;
      await this.notifySeller(from, `Atenção: o assistente não conseguiu responder ${from}. Assuma a conversa.`);
    }
    await this.whatsapp.sendText(from, reply);
    return reply;
  }

  // Executa um turno do agente. O histórico só recebe acréscimos (a resposta completa do provedor),
  // o que mantém válidos os blocos de raciocínio do Claude entre turnos.
  async runTurn(from, provider, messages) {
    const system = await this.getSystem();
    for (let round = 0; round < 6; round++) {
      const result = await provider.complete({system, tools: TOOLS, messages});
      messages.push(...result.append);

      if (result.refused) {
        this.log.warn(`[${provider.name}] recusa`, from, result.refusalCategory);
        return null;
      }
      if (!result.toolCalls.length) return result.text || null;

      const results = [];
      for (const call of result.toolCalls) {
        try {
          results.push({id: call.id, content: await this.runTool(from, call.name, call.input ?? {})});
        } catch (error) {
          results.push({id: call.id, content: error.message, isError: true});
        }
      }
      messages.push(...provider.toolResults(results));
    }
    return null;
  }

  async runTool(from, name, input) {
    if (name === 'registrar_lead') {
      const lead = await this.store.updateLead(from, input);
      return `Lead atualizado. Status: ${lead.status}.`;
    }
    if (name === 'encaminhar_para_vendedor') {
      const lead = await this.store.updateLead(from, {
        status: 'encaminhado',
        encaminhamento: input.tipo,
        preferenciaHorario: input.preferencia_horario,
        resumoParaVendedor: input.resumo,
        encaminhadoEm: new Date().toISOString(),
      });
      const notified = await this.notifySeller(from, sellerMessage(lead, input));
      return notified
        ? 'Vendedor avisado. Confirme ao cliente que um consultor vai entrar em contato para confirmar o horário.'
        : 'Lead marcado como encaminhado; o time comercial verá no painel. Confirme ao cliente que um consultor vai entrar em contato.';
    }
    throw new Error(`Ferramenta desconhecida: ${name}`);
  }

  // O aviso só chega se o vendedor tiver conversado com o número comercial nas últimas 24h
  // (regra da janela de atendimento da Meta). Falhas são registradas e não interrompem o cliente.
  async notifySeller(from, text) {
    let ok = false;
    for (const seller of this.config.sellerNumbers) {
      try {
        await this.whatsapp.sendText(seller, text);
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
