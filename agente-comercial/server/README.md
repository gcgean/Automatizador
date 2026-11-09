# Agente comercial do WhatsApp (Command System)

Servidor que atende o número comercial **+55 85 93618-1071** pela WhatsApp Cloud API (API oficial da Meta). A IA conversa com o cliente, qualifica o lead, grava os dados em `server/data/` e avisa o vendedor pelo WhatsApp quando o cliente aceita uma apresentação, reunião ou ligação.

A IA que responde pode ser **Claude, DeepSeek, Ollama (local) ou qualquer API compatível com OpenAI**. Ela é escolhida no `.env` ou trocada com o servidor rodando.

Ele roda separado do app Electron do Nexo, porque o webhook da Meta precisa de um endereço HTTPS público ligado o tempo todo.

> Histórico do que foi feito e lista do que falta: [`../AGENTE-COMERCIAL.md`](../AGENTE-COMERCIAL.md).

## Arquivos

| Arquivo | Função |
|---|---|
| `index.js` | Servidor HTTP: `GET/POST /webhook`, `GET /leads`, `GET/POST /config`, `GET /health` |
| `agent.js` | Fluxo da conversa e ferramentas `registrar_lead` / `encaminhar_para_vendedor` |
| `llm.js` | Provedores de IA (Claude via SDK oficial; DeepSeek/Ollama/OpenAI via `/chat/completions`) |
| `roteiro-comercial.md` | Instruções do atendente. Edite e reinicie o servidor para mudar o comportamento |
| `whatsapp.js` | Envio de mensagens, validação da assinatura, leitura do webhook |
| `store.js` | `data/leads.json`, `data/conversas/<telefone>.json`, `data/config.json` |
| `configurar-meta.js` | Registra o número, inscreve o app na conta e envia a logo (já executado) |
| `registrar-numero.js` | Só o registro do número (alternativa ao anterior) |

## Instalar (Node.js 22+)

```bash
npm install
npm install @anthropic-ai/sdk   # só se for usar Claude
cp server/.env.example server/.env   # se ainda não tiver o .env
```

Rodar: `npm run server` (porta `PORT`, padrão 3333).

## Escolher a IA

No `.env`: `AI_PROVIDER=claude` | `deepseek` | `ollama` | `openai`, com a chave e o modelo do provedor.

Com o servidor rodando (precisa do `PAINEL_TOKEN`):

```bash
# ver a IA ativa e quais estão configuradas
curl -H "Authorization: Bearer SEU_PAINEL_TOKEN" https://SEU-DOMINIO/config
# trocar
curl -X POST -H "Authorization: Bearer SEU_PAINEL_TOKEN" -d '{"provider":"deepseek"}' https://SEU-DOMINIO/config
```

A escolha fica salva em `data/config.json` e vale sobre o `.env`. A troca só é aceita se o provedor tiver chave e modelo no `.env`. Cada IA guarda o histórico no próprio formato. Quando você troca, a conversa de cada cliente recomeça na nova IA, que já recebe os dados do lead coletados até ali.

Observações:
- **Claude**: usa o SDK oficial, com fallback automático em caso de recusa. É o mais preparado para seguir o roteiro e usar as ferramentas.
- **Ollama**: modelos pequenos (3B) erram muito as ferramentas. Use 7B ou maior, com suporte a tools.
- **openai**: serve para OpenAI, Groq, OpenRouter, Together etc. Basta mudar `OPENAI_BASE_URL`.

## Webhook na Meta

App **Comercial Command** → WhatsApp → Configuração → Webhook:
- URL de callback: `https://SEU-DOMINIO/webhook`
- Token de verificação: o mesmo valor de `WHATSAPP_VERIFY_TOKEN`
- Assinar o campo **messages**

`WHATSAPP_APP_SECRET` precisa ser a chave secreta desse app (Configurações do app → Básico). Sem ela, toda mensagem é recusada com 401.

## Avisos ao vendedor

O aviso é uma mensagem de texto comum. A Meta só entrega mensagem livre para quem falou com o número nas últimas 24 horas. Então cada vendedor deve mandar um "oi" para o número comercial no início do dia, ou o aviso falha. O lead continua salvo em `data/leads.json` e aparece no log. Para avisos sem essa limitação, crie um modelo de mensagem aprovado (exige forma de pagamento na conta do WhatsApp) e troque o envio em `agent.js` por um template.

## Consultar leads

```bash
curl -H "Authorization: Bearer SEU_PAINEL_TOKEN" https://SEU-DOMINIO/leads
```

## Testes

```bash
node --test tests/server.test.mjs
```

## Fila persistente e atendimento humano

O webhook grava as mensagens em `data/inbox.json` antes de responder à Meta. Execute uma única instância do servidor com esse diretório de dados. Inclua todo `server/data` no backup. Mensagens aguardando processamento são retomadas no início do servidor. Execuções interrompidas ou falhas durante processamento ficam em `attention`, bloqueando o processamento seguinte daquele telefone até conferência humana. A resposta HTTP da API de envio ainda não comprova entrega ao destinatário.

`GET /inbox`, protegido por `PAINEL_TOKEN`, permite consultar estados e mensagens. Após conferir e resolver manualmente um caso, use `POST /inbox/resolve` com `{"id":"ID_DA_MENSAGEM","resolution":"handled_manually"}`. Isso registra a resolução e libera as mensagens seguintes. Não reenvia a mensagem sinalizada.

Após encaminhamento ou falha da IA, novas mensagens são guardadas em `pendingHuman` no arquivo da conversa. Para devolver os próximos contatos à IA, use `POST /leads/TELEFONE/automation` com `{"enabled":true}` e o mesmo token. `false` pausa o atendimento automático. Mensagens já reservadas ao humano não são reenviadas à IA automaticamente.

Ainda pendentes: interface visual para operar esses controles, confirmação de entrega por eventos da Meta, bloqueio persistente por opt-out e validação ponta a ponta na conta real.

## Painel e produção Windows

O painel é construído com `npm run build` e servido pelo mesmo servidor Node na raiz `/`. `npm run dev` inicia apenas o frontend com proxy para o backend local.

A instalação publicada fica em `C:\Projetos\prod\agente-comercial`, com Docker Compose e túnel Cloudflare dedicado. Consulte a seção datada de 05/11/2026 em `AGENTE-COMERCIAL.md` para o estado real da publicação e as pendências de ativação.

`PANEL_ONLY=true` bloqueia o webhook e envios humanos e não retoma a fila ao iniciar. Use esse modo enquanto faltarem credenciais. `PAINEL_TOKEN` é obrigatório para iniciar o servidor; o login não grava a chave no navegador.

Rotas autenticadas adicionais:

- `GET /conversations/:telefone`: histórico e confirmações.
- `GET/POST /context`: contexto adicional do operador, até 12.000 caracteres.
- `POST /leads/:telefone/block`: bloqueio persistente de envios.
- `POST /leads/:telefone/reply`: resposta humana, com `text` e `requestId` único, somente dentro da janela de atendimento e sem bloqueio.
- `POST /leads/:telefone/automation`: pausa/retoma a IA com `enabled`.
- `GET /inbox` e `POST /inbox/resolve`: pendências de execução.

As confirmações `sent`, `delivered`, `read` e `failed` são persistidas em `events.json`. Pedidos explícitos de descadastro são tratados antes da geração da resposta e bloqueiam também envios humanos.

Testes: `npm test`. QA visual/interações com dados fictícios: `node tests/panel-qa.mjs` (requer Microsoft Edge instalado). O QA não usa a Meta nem uma IA real.

## Atualização PostgreSQL / login por senha

Consulte a seção datada mais recente em `AGENTE-COMERCIAL.md`. Em produção `DATABASE_URL` é obrigatória e os dados são gravados no PostgreSQL; as descrições anteriores de gravação em JSON representam o modo legado local.

- `POST /auth/setup`: define a primeira senha com e-mail e token de ativação de uso único.
- `POST /auth/login`: e-mail/senha, abre uma sessão de 12 horas.
- `GET /auth/me`: identidade da sessão.
- `POST /auth/logout`: revoga a sessão.
- `POST /auth/password`: senha atual/nova senha; revoga outras sessões.
- `GET /reports?from=AAAA-MM-DD&to=AAAA-MM-DD`: métricas por período.
- `GET /reports/messages.csv`: exportação autenticada do mesmo período, até 100.000 mensagens.

Requisições de alteração do painel usam cookie de sessão e `X-Requested-With: CommandPanel`. O token técnico anterior é aceito somente no modo legado sem banco, para os testes anteriores.

Migração: `node server/migrate.js` em container com as variáveis de produção, com a aplicação parada para congelar os JSON de origem. Ela é transacional e só é aplicada uma vez. O servidor usa um advisory lock no banco para impedir duas instâncias processando a mesma fila.

## Conexões e contextos

A produção usa ConnectionRegistry e stores separados por connection_id. O webhook roteia pelo phone_number_id da Meta e verifica a assinatura com a chave correspondente. A conta atual é a conexão default; o histórico anterior foi preservado nela.

- GET/POST /connections: cadastro de números (as credenciais nunca voltam em GET).
- POST /connections/:id/activate: validação Meta e ativação.
- GET/POST /contexts: cadastro e versões de contexto.
- As rotas /leads, /conversations, /config, /context, /inbox, /reports e /learning aceitam ?connection=ID. Sem o parâmetro usam default.
- POST /leads/:telefone/qualify: reavaliar temperatura com o histórico da conexão.
- POST /leads/:telefone/state: ajuste de temperatura/resultado confirmado.
- GET /learning e POST /learning/analyze: métricas e sugestões para revisão.
- POST /learning/:id/apply, /reject, /undo: aprovar, recusar e desfazer.

CONNECTIONS_ENCRYPTION_KEY deve ser uma chave aleatória estável de 32 bytes, em hexadecimal (64 caracteres), guardada no .env. Trocá-la sem recifrar o banco impede recuperar credenciais de conexões adicionais. As credenciais do número original continuam no ambiente do servidor.

A migração multi-connections-v1 é transacional e executa na inicialização. Para a primeira atualização, parar a aplicação e fazer dump do PostgreSQL antes de iniciar a nova imagem, pois as chaves primárias das tabelas passam a incluir a conexão. A aprovação de uma sugestão não faz fine-tuning da IA: cria um contexto aprovado, versionado e reversível.

## Usuários e permissões

Apenas administradores acessam GET/POST /users, POST /users/:id e POST /users/:id/invitation. Listagens não retornam senha, hash, token ou link de ativação. O link é retornado somente ao criar ou regenerar acesso, tem validade de 24 horas e não é enviado por e-mail.

users-schema.sql adiciona nome, perfil e situação às contas e a tabela user_connections. O administrador preexistente continua admin. Perfis operator e viewer precisam de pelo menos uma conexão atribuída. Toda requisição verifica a conta ativa e as conexões atuais; a restrição é aplicada no backend, não apenas nos menus. Viewer não executa alterações de atendimento. Todos os perfis podem trocar a própria senha e encerrar sua própria sessão.


## Agenda automática de apresentações (06/11/2026)

Configurações → Agenda guarda preferências por conexão WhatsApp: chave Command Analytics, procedimento, apresentadores autorizados, dias, janela de horários e quantidade de opções. Para a conexão padrão, COMMAND_AGENDA_API_KEY pode ser fornecida pelo ambiente; chaves cadastradas no painel são criptografadas e não retornam ao navegador.

A IARA consulta disponibilidade real e oferece opções. Após a escolha, envia o resumo e exige uma nova mensagem de confirmação do cliente. Revalida o horário antes do POST; só confirma ao cliente quando recebe o registro válido da API. Os dados ficam no PostgreSQL, com referência IARA por tentativa e proteção contra duplicação. O resultado do lead passa a apresentação agendada.

Conflito de horário oferece novas opções. Timeout, resposta divergente ou interrupção durante o POST exigem conferência em Configurações → Agenda. O operador consulta o Analytics, informa o ID encontrado (validado pela API e pela referência) ou confirma que não foi criado. Nunca se repete automaticamente um POST incerto: a API não oferece chave de idempotência. A conferência não envia mensagens; retome o atendimento pelo painel após revisar.

O procedimento e os apresentadores devem ser selecionados pelo administrador antes de ativar. Não há cancelamento/remarcação automática nem sincronização de mudanças feitas posteriormente no Analytics nesta versão. Nenhum agendamento real foi criado nos testes; servidor e interface foram validados com API simulada, além de leitura real do catálogo. O primeiro teste ponta a ponta deve usar um horário real escolhido e confirmado pelo usuário.


## Testar IARA e marcação no chat (06/11/2026)

Configurações → Testar IARA inicia uma sessão isolada para o administrador, usando o contexto e provedor salvos da conexão selecionada. As chamadas à IA são reais e consomem os créditos do provedor. WhatsApp e agenda usam transportes simulados: nenhum destinatário externo é contatado e nenhuma reserva real é criada. Os horários fictícios têm duração de 60 minutos; a agenda simulada fica ativa mesmo se a agenda de produção estiver desativada. O teste verifica conversa, oferta, escolha e confirmação; não valida disponibilidade real da Ariany.

Digite como lead, escolha 1/2/3 e confirme após o resumo. A sessão permite até 60 mensagens, expira após 30 minutos sem atividade e pode ser reiniciada. Há no máximo quatro sessões simultâneas. Dados ficam em schemas PostgreSQL isolados, fora dos leads, relatórios e aprendizado de produção; são removidos no reinício do teste, na expiração e no encerramento/reinício do servidor. Sessões são vinculadas ao usuário e à conexão.

No atendimento real, a confirmação válida da API cria uma marcação interna no histórico e um destaque fixo no chat com data, hora, responsável e referência. Essa marcação não é enviada como mensagem adicional e não conta como envio nos relatórios. A mensagem normal da IARA confirma o agendamento ao cliente. Falhas ou respostas incertas não recebem marcação de sucesso.


## Agendamento real na área de testes (06/11/2026)

Configurações → Testar IARA → Modo do teste permite escolher Simulação ou Agendamento real. O modo real exige aceite explícito antes de iniciar e a agenda da conexão precisa estar ativa. Consulta os responsáveis e a disponibilidade reais, usando o mesmo fluxo de escolha e confirmação do cliente; somente então envia o POST. O WhatsApp continua bloqueado.

A descrição na API começa com TESTE REAL DO PAINEL. Reservas, tentativas, confirmações e a conversa do teste real ficam no schema PostgreSQL permanente iara_agenda_tests, separados dos leads e relatórios de produção. Este schema participa do backup completo do banco. Reiniciar ou expirar a sessão não apaga nem cancela a reserva; a tabela Agendamentos reais feitos nos testes conserva dia, horário, responsável, situação e ID. Para cancelar, use o Analytics (a situação exibida reflete a última confirmação conhecida, sem sincronização automática de cancelamentos externos).

Tentativas incertas após falhas de rede ou interrupção bloqueiam novos testes reais na mesma conexão até conferência. O botão Conferir teste real valida por API o registro encontrado e sua referência ou recebe a confirmação explícita de que não foi criado. Não há repetição automática do POST incerto. A reserva real só deve ser confirmada pelo usuário quando desejar ocupar aquele horário; validação automatizada desta versão usou API de teste injetada, sem criar reserva externa.


## Integração automática com Cilos CRM (06/11/2026)

Endpoint fixo: POST https://app.crm.cilos.com.br/api/integration/leads, Authorization Bearer. O token da conexão padrão é lido de CILOS_CRM_TOKEN; outras conexões podem cadastrar credenciais criptografadas em Configurações → CRM. O painel nunca retorna o token. Canal inicial aprovado: WhatsApp. Segmento fixo opcional; vazio usa o segmento informado no lead.

A ferramenta identificar_interacao_comercial marca interesse demonstrado, pergunta comercial ou necessidade explicada. Cumprimento isolado, emoji ou agradecimento não qualificam. A IARA registra os dados conhecidos sem transformar a conversa em entrevista. Depois de responder com sucesso ao lead, a plataforma coloca o cadastro numa fila PostgreSQL. Não há importação retroativa em massa. Contatos bloqueados/descadastrados não são enviados; testes da IARA, inclusive agendamento real de teste, não cadastram leads no CRM.

Payload: nome, telefone, whatsapp, email conhecido, canal, segmento conhecido e observacao contendo empresa, cidade, produto, temperatura, resumo e apresentação agendada. codigo_externo é fixo por conexão/contato e preservado no banco; novas informações usam o mesmo código para atualizar, conforme o contrato da API fornecido. Isso evita repetir cadastros criados por esta integração; não faz busca por contatos antigos criados por outras origens sem esse código.

A fila separa o atendimento de falhas do CRM, repete falhas transitórias com espera crescente, retoma após reinício e mostra erros permanentes para revisão. É possível tentar novamente no painel. A resposta precisa confirmar success, action created/updated, ID e código externo esperado. Warnings do canal/segmento não invalidam um lead confirmado: aparecem na tabela para correção de mapeamento. O ID fica também nos dados do lead. A fila processa até dez itens por ciclo de 15 segundos. Revisões impedem que uma resposta antiga apague uma atualização mais recente na fila.

Validação: API de CRM simulada nos testes automatizados (cadastro, atualização com mesmo código, isolamento entre números, retomada e opt-out); interface validada em desktop/mobile. Não foram criados leads fictícios no CRM real. O primeiro envio real será de uma próxima interação qualificada no WhatsApp, acompanhado em Configurações → CRM.


## Teste de CRM, indicadores e cadência (06/11/2026)

Configurações → Testar IARA permite escolher CRM simulado ou CRM real, independentemente da agenda simulada/real. O CRM real exige aceite e telefone brasileiro de teste. A IARA qualifica a interação usando o mesmo fluxo do atendimento e envia um cadastro identificado como TESTE IARA. Um telefone de teste na mesma conexão mantém seu código externo, inclusive ao reiniciar a conversa; o cadastro de teste é separado do cadastro de produção do mesmo telefone. Os registros reais de teste e sua fila ficam no schema permanente iara_agenda_tests. Há histórico e repetição manual de erros na tela; falhas transitórias são retomadas em segundo plano. Nenhum WhatsApp é enviado pela área de testes. Nenhuma campanha de cadência é iniciada nessa área.

Após confirmação válida do CRM, o chat recebe uma marcação interna e destaque com o ID. A lista de contatos mostra CRM e Apresentação agendada quando esses registros estiverem confirmados localmente. Marcações internas não contam como mensagens enviadas nos relatórios. Alterações/cancelamentos feitos fora da plataforma não são consultados continuamente.

As conversas estão divididas em Em atendimento, Ganhos e Descartados. Dados do lead permite marcar ganho, descartar e reabrir, sem apagar histórico. Ganho/descarte interrompem automação e acompanhamento. Se o cliente escrever novamente enquanto encerrado, sua mensagem fica no histórico para o gestor; não reabre automaticamente.

Cadência configurável por conexão em Configurações → Cadência: até cinco tentativas, uma por dia, no horário estimado a partir das últimas 20 respostas recebidas (hora mais frequente, desempate pelo horário recente; pouco histórico usa a última resposta). Isso não garante disponibilidade. Somente leads com interesse identificado e uma pergunta/pedido da IARA ainda pendente são programados. A primeira tentativa é no dia seguinte. Não há importação de históricos antigos em massa e o limite não descarta o lead automaticamente.

Acompanhamento em dias posteriores usa um modelo MARKETING de texto aprovado na Meta, validado novamente antes do envio. Modelo inicial: atendimento_retorno_cs_v2, pt_BR. Referência: https://business.whatsapp.com/policy/preview?lang=pt_BR . É exigida autorização de acompanhamento do cliente: o gestor registra em Dados do lead, ou a plataforma reconhece uma frase expressa como “pode me chamar depois”. Um simples cumprimento ou resposta comercial não é tratado como autorização automática para retornos. Remover a autorização interrompe a cadência.

A cadência para quando o cliente responder (e pode ser replanejada apenas se surgir nova pendência), recusar (“não”, “não tenho interesse”, “não me incomode”), descadastrar, for assumido por humano, tiver apresentação confirmada, for marcado como ganho/descartado ou atingir o limite. A recusa permanece como bloqueio de cadência até nova autorização/ação do gestor. A fila persistente usa a mesma serialização de atendimento por telefone; envios incertos não são repetidos automaticamente e exigem conferência. O modelo e o estado do lead são revalidados antes do envio. Se o horário foi perdido por mais de uma hora, uma pendência ainda não enfileirada é movida para o próximo dia no horário estimado.

Validação desta entrega: 27 testes automatizados no PostgreSQL isolado e testes de interface em desktop/mobile. Os envios de CRM, agenda e cadência usados pela validação foram simulados; a leitura do catálogo real da Meta confirmou o modelo aprovado. Não foram enviadas mensagens nem criados cadastros/reservas reais de teste durante a validação.


## Migração para CRM Cilos API v1 (07/11/2026)

Documentação atual: https://app.crm.cilos.com.br/integracao-v1.htm#clientes . O bot agora usa POST https://app.crm.cilos.com.br/api/integracao/v1/clientes com Authorization Bearer e o token renovado no ambiente de produção. A v1 aceita também x-api-key, mas a autenticação existente por Bearer foi mantida. O cadastro por codigo_externo preserva os códigos e IDs já utilizados; não há recadastro em massa.

O campo canônico enviado para o resumo é observacoes. Itens antigos já salvos na fila com observacao são convertidos apenas ao enviar, sem perder seu codigo_externo. A confirmação aceita o código retornado como codigo_externo ou codigoExterno. Campos, indicadores e regras de interação continuam iguais. Criar exige clientes.criar; atualizar um código existente exige também clientes.editar.

A chave renovada foi validada por uma consulta autenticada GET /clientes com busca aleatória sem resultados; nenhum cliente real foi criado ou alterado na verificação. A validação automatizada do cadastro/atualização utiliza API simulada. Produtos, categorias, metas, negócios e novidades ficaram disponíveis na documentação, mas não foram adicionados ao escopo de sincronização do bot nesta mudança.


## Negócios, anexos e fotos de contatos (09/11/2026)

Após confirmar o cliente no CRM, a conexão pode criar automaticamente um negócio no funil, etapa e responsável escolhidos em Configurações → CRM. Para Comercial Command: Sistema → Contato feito → Ariany. Cliente e negócio têm IDs separados exibidos na lista e no chat. O gestor confirma ganho com valor ou perda com motivo em Dados do lead. A plataforma só arquiva após consultar e confirmar o resultado no CRM. A API não permite editar negócios já finalizados.

Como não há idempotência documentada para POST /negocios, cada criação possui uma referência persistente IARA-DEAL-UUID nas observações. Após timeout, o sistema busca por cliente e referência; não repete POST automaticamente. Divergências são conferidas em Configurações → CRM. Um negócio por contato/conexão; sem recadastro em massa dos antigos. Testar IARA inclui negócio simulado; criar negócio real de teste exige marcar a opção específica e utiliza o destino configurado.

O chat recebe imagens, áudio, vídeo, documentos e figurinhas e oferece Anexar arquivo e Gravar áudio para envio manual. Limites: imagens JPG/PNG 5 MB; áudio/vídeo 16 MB; documentos 100 MB. Envios exigem perfil autorizado, conexão ativa, contato não bloqueado e janela de atendimento vigente. A gravação do microfone exige HTTPS e permissão do navegador. WebM/WAV são convertidos para OGG Opus. Envios sem confirmação permanecem pendentes para conferência, evitando repetição automática.

Os arquivos são baixados da Meta, verificados e armazenados em DATA_DIR/media; só são servidos mediante autenticação e acesso à conexão. Reprodução de áudio/vídeo suporta requisições Range. Não são expostas URLs temporárias ou tokens da Meta. O backup diário inclui banco e mídias. Arquivos antigos recebidos antes desta versão não tinham media_id salvo e podem precisar ser reenviados.

Transcrição: serviço Docker privado transcriber, faster-whisper 1.2.1, PyAV 16.0.1, modelo small CPU/int8. TRANSCRIBER_URL=http://transcriber:8000, sem porta pública. Áudios e a fala dos vídeos são transcritos localmente (máximo dez minutos), permitindo à IARA responder ao texto reconhecido. Falha ou ausência de fala encaminha para equipe, preservando o arquivo. Imagens e documentos são visualizáveis pela equipe; seu conteúdo não é analisado automaticamente pelo DeepSeek. Não tratar legendas como leitura visual. Pedidos de descadastro transcritos interrompem as respostas.

Miniaturas: foto JPG/PNG cadastrada em Dados do lead, isolada por conexão; sem foto são usadas iniciais. O webhook atualmente utilizado fornece o nome, sem URL de foto pessoal. O cadastro de foto é local e não altera o WhatsApp do cliente. A tela de conversas tem temas claro/escuro, lista com avatares e balões verdes; a preferência de tema fica no navegador.

Validação: 29 testes automatizados com PostgreSQL isolado, APIs simuladas e testes de interface Edge em desktop/notebook/mobile. Transcrição e conversão de áudio verificadas no serviço Docker com fala sintética, sem áudio de clientes. Nenhuma mensagem WhatsApp ou negócio real foi criado pelos testes automatizados.


### Correções de áudio e mensagens pendentes (09/11/2026)

O conversor aceita WebM de MediaRecorder sem duração no cabeçalho: primeiro decodifica para OGG e verifica a duração do resultado. Gravações inferiores a um segundo são recusadas no navegador com orientação para gravar novamente; erros do conversor são apresentados sem ocultar o motivo. A gravação de navegador foi testada com entrada sintética de microfone, conversão real no Docker e envio simulado na Meta.

A IARA recebe instrução explícita de que a mensagem atual foi transcrita com sucesso. Limitações antigas registradas no histórico não devem fazê-la negar a transcrição fornecida. A transcrição fica expandida no chat. Verificação real do DeepSeek feita somente com conversa sintética; sem envio a clientes.

A lista mostra pendingReplyCount, número de mensagens de entrada após a última resposta confirmada (Meta accepted/sent/delivered/read). Abrir a conversa, criar CRM/agendamento ou uma tentativa de envio incerta não zera o contador. Uma resposta humana confirmada também zera; entrega marcada como failed não é considerada resposta confirmada. A prévia e a ordem da lista desconsideram marcações internas de CRM/agenda. Contadores são calculados a partir do histórico persistido e isolados por conexão. O avatar do cabeçalho abre Dados do lead para cadastrar/remover foto local; fotos pessoais do WhatsApp não são importadas automaticamente.


### Barra de envio e player compacto (09/11/2026)

A tela de conversas usa uma única barra de composição: + abre Fotos, Vídeos, Documentos, Áudios e Todos os arquivos. O campo vazio mostra microfone; ao digitar texto, surge o ícone de enviar. Enter envia texto e Shift+Enter mantém a quebra de linha. A gravação mostra cronômetro, descarte e parada para revisar antes de enviar. Anexos têm prévia, legenda quando permitida, cancelamento e confirmação por ícone; o aviso de fila desaparece após quatro segundos.

O player de áudio usa controles compactos de reproduzir/pausar, posição, duração e download autenticado. Não há altura padrão do player nativo nem área vazia acima dele. A transcrição continua acessível e expandida. Testes Edge em desktop/notebook/mobile cobrem menu, gravação real de navegador com entrada sintética, conversão local, envio simulado e reprodução/pausa.


### Acesso ao painel (09/11/2026)

Tela de login reorganizada com identidade visual Command, apresentação lateral em desktop e composição compacta em celular. Os campos de senha do login, ativação e troca de senha possuem botão Mostrar/Ocultar, acessível por teclado, sem enviar ou armazenar essa preferência no servidor. O comportamento de autenticação, convites e sessões permanece o mesmo. A validação Edge cobre exibição/ocultação, ativação, login, troca de senha e visual desktop/mobile com contas sintéticas.


## Grupos, assinatura e atendimento humano (09/11/2026)

Configurações → Grupos de acesso permite criar/editar/desativar grupos, selecionar usuários, conexões e funções. Configurações → Usuários permite manter os perfis anteriores ou ativar acesso personalizado, selecionar grupos, permissões adicionais e conexões individuais. No modo personalizado, as permissões são a união dos grupos ativos e concessões individuais; as conexões também se somam. Remover/desativar um grupo não restaura as permissões do perfil antigo. Administradores mantêm acesso total e são os únicos que gerenciam usuários, grupos, conexões e contextos compartilhados. O último administrador ativo continua protegido.

As permissões efetivas são consultadas a cada requisição e validadas no servidor, além do controle dos botões e abas. São controlados: ver conversas, responder texto, anexar mídias, escolher assinatura, pausar/retomar IA, transferir, classificar/encerrar lead, bloquear, foto local, pendências, fechamento de negócio, relatórios/exportação, aprendizado, IA, agenda, CRM, cadência e testes. Configurações delegadas respeitam a conexão autorizada. A identidade logada é apresentada discretamente no cabeçalho.

Mensagens manuais de texto podem ser assinadas no formato WhatsApp *Nome do atendente:* seguido de quebra de linha e mensagem. O nome vem do usuário autenticado; nunca de nome informado no corpo da requisição. A assinatura padrão é configurada no cadastro do usuário. A permissão signature.choose libera o ícone de caneta para ligar/desligar em cada mensagem; sem ela, vale a preferência definida pelo administrador. Sem nome cadastrado, o texto usa Equipe Command para não expor o e-mail de login ao cliente. O histórico registra operatorId, operatorName e signed. A assinatura não altera respostas da IA nem arquivos de áudio.

A lista separa IA, Humanos, Ganhos e Descartados. Status encaminhado pertence à aba Humanos, inclusive encaminhamentos automáticos sem responsável. Transferir oferece somente usuários ativos, com senha ativada, acesso à conexão e permissão de responder. A transferência atribui responsável, pausa IA/cadência e cria uma nota interna; não envia uma mensagem adicional ao cliente. Retomar IA limpa a atribuição anterior. Mensagem manual de texto coloca o atendimento em Humanos e atribui ao usuário que respondeu. A IA verifica a versão de controle antes de novas ferramentas e do envio: uma resposta em preparação não é enviada após transferência/pausa manual.

Validação: 30 testes com PostgreSQL isolado, incluindo herança/revogação, isolamento de conexões, assinatura autenticada/sem assinatura, alvo inválido e transferência durante resposta da IA. QA Edge em desktop/notebook/mobile cobre grupos, assinatura, usuário logado, transferência/retomada e os fluxos existentes. Integrações e mensagens de teste são simuladas, sem envio a clientes reais.
