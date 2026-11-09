// Provedores de IA que podem atender o cliente. Cada um sabe montar a chamada no seu formato
// e devolve uma resposta normalizada para o agente:
//   { append: [mensagens a acrescentar ao histórico], text, toolCalls: [{id, name, input}], refused }
// e converte resultados de ferramentas com toolResults([{id, content, isError}]).

export const PROVIDERS = ['claude', 'deepseek', 'ollama', 'openai'];

export function providerSettings(name, env = process.env) {
  switch (name) {
    case 'claude':
      return {name, model: env.CLAUDE_MODEL || 'claude-opus-5-5', effort: env.CLAUDE_EFFORT || 'low', ready: Boolean(env.ANTHROPIC_API_KEY || env.ANTHROPIC_AUTH_TOKEN)};
    case 'deepseek':
      return {name, model: env.DEEPSEEK_MODEL || 'deepseek-flash', baseURL: 'https://api.deepseek.com', key: env.DEEPSEEK_API_KEY || '', ready: Boolean(env.DEEPSEEK_API_KEY)};
    case 'ollama':
      return {name, model: env.OLLAMA_MODEL || 'qwen2.5:7b', baseURL: (env.OLLAMA_BASE_URL || 'http://localhost:11434/v1').replace(/\/+$/, ''), key: '', ready: true};
    case 'openai':
      return {name, model: env.OPENAI_MODEL || '', baseURL: (env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''), key: env.OPENAI_API_KEY || '', ready: Boolean(env.OPENAI_MODEL && env.OPENAI_API_KEY)};
    default:
      throw new Error(`Provedor de IA desconhecido: ${name}. Use um destes: ${PROVIDERS.join(', ')}.`);
  }
}

export function createProvider(name, {env = process.env, anthropicClient, fetchImpl = fetch} = {}) {
  const settings = providerSettings(name, env);
  return name === 'claude' ? new ClaudeProvider(settings, anthropicClient) : new OpenAICompatibleProvider(settings, fetchImpl);
}

class ClaudeProvider {
  constructor(settings, client) {
    this.settings = settings;
    this.name = 'claude';
    this.client = client;
  }

  async getClient() {
    if (!this.client) {
      const {default: Anthropic} = await import('@anthropic-ai/sdk');
      this.client = new Anthropic();
    }
    return this.client;
  }

  async complete({system, tools, messages}) {
    const client = await this.getClient();
    const response = await client.beta.messages.create({
      model: this.settings.model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: {effort: this.settings.effort},
      cache_control: {type: 'ephemeral'},
      system,
      tools,
      tool_choice: {type: 'auto'},
      messages,
    });
    // O conteúdo completo volta ao histórico (inclusive blocos de raciocínio), sem edição.
    return {
      append: [{role: 'assistant', content: response.content}],
      refused: response.stop_reason === 'refusal',
      refusalCategory: response.stop_details?.category,
      text: response.content.filter(b => b.type === 'text').map(b => b.text).join('\n').trim(),
      toolCalls: response.stop_reason === 'tool_use'
        ? response.content.filter(b => b.type === 'tool_use').map(b => ({id: b.id, name: b.name, input: b.input}))
        : [],
    };
  }

  toolResults(results) {
    return [{role: 'user', content: results.map(r => ({type: 'tool_result', tool_use_id: r.id, content: r.content, ...(r.isError ? {is_error: true} : {})}))}];
  }
}

// DeepSeek, Ollama e qualquer API no formato /chat/completions da OpenAI.
class OpenAICompatibleProvider {
  constructor(settings, fetchImpl) {
    this.settings = settings;
    this.name = settings.name;
    this.fetch = fetchImpl;
  }

  async complete({system, tools, messages}) {
    const {baseURL, key, model} = this.settings;
    if (!model) throw new Error(`Configure o modelo do provedor ${this.name}.`);
    const response = await this.fetch(`${baseURL}/chat/completions`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', ...(key ? {Authorization: `Bearer ${key}`} : {})},
      body: JSON.stringify({
        model,
        messages: [{role: 'system', content: system}, ...messages],
        tools: tools.map(t => ({type: 'function', function: {name: t.name, description: t.description, parameters: t.input_schema}})),
        tool_choice: 'auto',
        temperature: 0.4,
      }),
      signal: AbortSignal.timeout(120000),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${this.name}: ${data?.error?.message ?? `HTTP ${response.status}`}`);
    const message = data.choices?.[0]?.message ?? {role: 'assistant', content: ''};
    const assistant = {role: 'assistant', content: message.content ?? ''};
    // O DeepSeek exige esse campo de volta no histórico de chamadas com ferramentas.
    // Ele permanece no armazenamento interno e não é enviado ao cliente.
    if (this.name === 'deepseek' && typeof message.reasoning_content === 'string') assistant.reasoning_content = message.reasoning_content;
    if (message.tool_calls?.length) assistant.tool_calls = message.tool_calls;
    return {
      append: [assistant],
      refused: false,
      text: (message.content ?? '').trim(),
      toolCalls: (message.tool_calls ?? []).map(call => ({id: call.id, name: call.function?.name, input: parseArgs(call.function?.arguments)})),
    };
  }

  toolResults(results) {
    return results.map(r => ({role: 'tool', tool_call_id: r.id, content: r.isError ? `Erro: ${r.content}` : r.content}));
  }
}

function parseArgs(raw) {
  if (raw && typeof raw === 'object') return raw;
  try { return JSON.parse(raw || '{}'); } catch { return {}; }
}
