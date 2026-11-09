# Agente comercial do WhatsApp: histórico e próximos passos

Resumo de tudo que foi feito para colocar uma IA atendendo o WhatsApp comercial da **Command System**, e do que falta para ela ir ao ar numa VPS. Atualizado em 04/11/2026.

## Objetivo

A IA conversa com quem chama o número comercial, entende a necessidade, qualifica o lead (empresa, segmento, tamanho, sistema atual, dor, prazo, temperatura) e prepara a passagem para o vendedor humano. O vendedor agenda a apresentação do sistema, a reunião ou a ligação. A IA não inventa preço nem funcionalidade e não confirma horário sozinha: quem confirma é o consultor.

## O que já está pronto

### 1. Número virtual (Salvy)
- Linha **"Comercial Command"**: **(85) 93618-1071**, número virtual comprado na Salvy (app.salvy.com.br, empresa COMMAND SYSTEMS).
- Só **recebe SMS**: não tem internet nem ligações. Serve apenas para receber códigos de verificação, que aparecem no painel da linha na Salvy.
- Os "campos personalizados" e as integrações de IA da Salvy servem para gestão de linhas e aparelhos. Não têm relação com atendimento.

### 2. WhatsApp Business na API oficial da Meta ✅
| Item | Valor |
|---|---|
| Portfólio empresarial | Command System (ID `103771031841506`), verificado |
| Conta do WhatsApp (WABA) | **Command System Suporte** (ID `3454868058013423`). É a mesma conta do número de suporte +55 88 9733-7701 |
| Número comercial | +55 85 93618-1071 (Phone Number ID **`1395892046947138`**) |
| Nome de exibição | **Command System Comercial**: **aprovado** |
| Categoria / descrição | Serviços profissionais / "Command System - empresa de software. Fale com nosso comercial: conheça nossos sistemas de gestão, tire dúvidas e agende uma apresentação." |
| Foto do perfil | Logomarca "command system Comercial" (`logo-command-comercial.jpg`) ✅ |
| Verificação | Por SMS, com o código recebido na Salvy ✅ |
| Registro na Cloud API | ✅ com PIN de duas etapas **123456** (status CONNECTED, plataforma CLOUD_API) |
| App da Meta | **Comercial Command** (App ID **`1922946735810180`**), caso de uso WhatsApp, inscrito na WABA ✅ |
| Usuário do sistema | **API_Comercial_Command** (ID `61595961342736`), com o app (gerenciar) e a WABA (tudo) atribuídos ✅ |
| Token permanente | Gerado e salvo em `server/.env` (`WHATSAPP_ACCESS_TOKEN`) ✅ |

Optamos por um app separado ("Comercial Command"), e não pelo app "Suporte Command", para que o webhook do comercial não se misture com o do suporte. Os dois números estão na mesma WABA. Por isso o servidor ignora eventos de qualquer número que não seja `1395892046947138`. **O backend do suporte também deveria filtrar pelo phone_number_id dele.**

### 3. Servidor do agente (`server/` neste projeto) ✅ código pronto, ❌ ainda não publicado
- `server/index.js`: webhook (`GET` de verificação e `POST` com validação da assinatura `X-Hub-Signature-256`), `/leads`, `/config` e `/health`.
- `server/agent.js`: fila por cliente, deduplicação de mensagens, ferramentas `registrar_lead` e `encaminhar_para_vendedor`. Se a IA falhar, o cliente recebe "um consultor vai continuar" e o vendedor é avisado.
- `server/llm.js`: **escolha da IA**: `claude`, `deepseek`, `ollama` ou `openai` (qualquer API compatível). Troca pelo `.env` (`AI_PROVIDER`) ou com o servidor rodando (`POST /config`).
- `server/roteiro-comercial.md`: o "prompt" do atendente. **Edite aqui para mudar o tom e as perguntas.**
- `server/configurar-meta.js`: script que registrou o número, inscreveu o app e enviou a logo (já executado com sucesso).
- `server/data/`: leads (`leads.json`), conversas e configuração. Fica fora do Git.
- Testes: `tests/server.test.mjs`, com **11 testes passando** (Meta e IA simuladas, sem chamadas reais).
- `package.json`: scripts `server`, `server:registrar` e `server:configurar-meta`. O `npm test` agora inclui `tests/*.test.mjs`.
- `.gitignore`: `server/.env` e `server/data/` ficam de fora.

O app desktop Nexo (Electron) e o `orientacoes-ia.txt` **não foram alterados**.

## ⚠️ Antes de mudar de computador

1. **`server/.env` NÃO vai pelo Git** (está no `.gitignore`). Ele tem o token da Meta. Copie esse arquivo à mão para o outro computador ou para a VPS, ou gere um token novo lá (passo abaixo).
2. **O token foi colado no chat** desta conversa. Ao exportar a conversa, ele vai junto. Recomendo **revogar e gerar outro**: business.facebook.com → Configurações → Usuários do sistema → API_Comercial_Command → **Anular tokens** → **Gerar token** (app Comercial Command, validade "Nunca", permissões `whatsapp_business_messaging` + `whatsapp_business_management`). Depois coloque o novo em `WHATSAPP_ACCESS_TOKEN`.
3. Leve também `logo-command-comercial.jpg`, se quiser reenviar a foto um dia.

## O que falta fazer

### A. Preencher o `server/.env`
- [ ] `AI_PROVIDER`: escolha `claude`, `deepseek`, `ollama` ou `openai`.
- [ ] A chave da IA escolhida: `ANTHROPIC_API_KEY`, `DEEPSEEK_API_KEY` ou `OPENAI_API_KEY`/`OPENAI_MODEL`. O Ollama não precisa de chave.
- [ ] `WHATSAPP_APP_SECRET`: developers.facebook.com → app **Comercial Command** → Configurações do app → Básico → Chave secreta.
- [ ] `WHATSAPP_VERIFY_TOKEN`: invente uma senha qualquer. A mesma vai na configuração do webhook.
- [ ] `VENDEDOR_WHATSAPP`: número(s) do(s) vendedor(es), só dígitos com DDI, ex.: `5585999999999`.
- [ ] `PAINEL_TOKEN`: outra senha, para consultar `/leads` e trocar a IA em `/config`.

### B. Subir na VPS
Exemplo para Ubuntu com Node 22+, Nginx e um domínio/subdomínio (ex.: `comercial.seudominio.com.br`) apontando para a VPS:

```bash
# 1. código
git clone <repo> /opt/automatizador && cd /opt/automatizador
npm install --omit=dev          # o servidor não precisa do Electron
npm install @anthropic-ai/sdk   # se for usar Claude
# copie o server/.env para /opt/automatizador/server/.env

# 2. teste rápido
npm run server                  # deve mostrar "Agente comercial ouvindo na porta 3333" e a IA ativa

# 3. manter rodando (pm2)
npm i -g pm2
pm2 start "npm run server" --name agente-comercial
pm2 save && pm2 startup

# 4. HTTPS com Nginx + Let's Encrypt
#    server_name comercial.seudominio.com.br;
#    location / { proxy_pass http://127.0.0.1:3333; proxy_set_header Host $host; }
sudo certbot --nginx -d comercial.seudominio.com.br

# 5. conferir
curl https://comercial.seudominio.com.br/health   # {"ok":true}
```

> `npm install --omit=dev` evita baixar o Electron/Playwright na VPS. Se o `npm install` completo falhar na VPS por causa do Electron, use esse comando.

### C. Ligar o webhook na Meta
- [ ] developers.facebook.com → **Comercial Command** → Casos de uso → Conectar no WhatsApp → **Configuração** → Webhook:
  - URL de callback: `https://comercial.seudominio.com.br/webhook`
  - Token de verificação: o valor de `WHATSAPP_VERIFY_TOKEN`
  - Clique em **Verificar e salvar** e depois **assine o campo `messages`**.
- [ ] **Publicar o app** (Painel → Publicar). Em modo de desenvolvimento, o webhook só entrega eventos de teste. Se pedir, conclua o que a tela de requisitos mostrar.

### D. Testar de ponta a ponta
- [ ] Mande "Oi" de um celular para o (85) 93618-1071 e veja a resposta da IA.
- [ ] Simule um cliente até aceitar a apresentação e confira:
  - o aviso no WhatsApp do vendedor (o vendedor precisa ter mandado "oi" ao número comercial nas últimas 24h);
  - o registro em `/leads`.
- [ ] Ajuste `server/roteiro-comercial.md` conforme o tom desejado e reinicie com `pm2 restart agente-comercial`.

### E. Pendências e melhorias
- [ ] **Forma de pagamento** na conta do WhatsApp (business.facebook.com → Cobrança e pagamentos). A Meta avisou que falta em 2 contas. Responder quem chama primeiro funciona sem cartão. Para iniciar conversa (templates, avisos ao vendedor fora da janela de 24h), o cartão é obrigatório.
- [ ] Modelo de mensagem (template) para o aviso ao vendedor, eliminando a regra das 24h.
- [ ] Tela de leads e de escolha da IA dentro do app Nexo. Hoje existem só os endpoints `/leads` e `/config`.
- [ ] Trocar o PIN 123456 por um menos óbvio (Gerenciador do WhatsApp → número → Configurações → Confirmação em duas etapas).
- [ ] Integração com agenda (Google Calendar etc.) para a própria IA marcar horário, se desejado.

## Referência rápida

| O quê | Onde |
|---|---|
| Painel da linha (códigos SMS) | app.salvy.com.br → Telefonia → Comercial Command |
| Gerenciador do WhatsApp | business.facebook.com → Gerenciador do WhatsApp → conta "Command System Suporte" |
| App da Meta | developers.facebook.com/apps/1922946735810180 |
| Usuário do sistema / token | business.facebook.com → Configurações → Usuários do sistema → API_Comercial_Command |
| Roteiro da IA | `server/roteiro-comercial.md` |
| Configuração | `server/.env` (modelo em `server/.env.example`) |
| Documentação técnica | `server/README.md` |

## Publicação neste computador — 05/11/2026

A instalação passou a usar este computador Windows, em vez de uma VPS remota.

- Código: `C:\Projetos\dev\Automatizador\agente-comercial`.
- Produção: `C:\Projetos\prod\agente-comercial`.
- Painel HTTPS: https://comercial.gestorfacil.ia.br.
- Webhook previsto: https://comercial.gestorfacil.ia.br/webhook.
- Containers dedicados: `command_comercial_prod` e `command_comercial_tunnel`.
- Porta local: `127.0.0.1:3333`. Cloudflare acessa o serviço pela rede Docker.
- Túnel dedicado: `command-comercial`, ID `2a5b8d56-0c85-4ae6-afb3-5c54f4186fd3`.
- FinanceHub e seu túnel não foram alterados.

### Funcionalidades entregues

Painel com autenticação por chave, busca de contatos, histórico, confirmações da Meta, escolha de IA, contexto adicional persistente, pausa/retomada, bloqueio de contato, resposta humana e conferência de pendências. Pedidos de descadastro reconhecidos pelas regras de `server/consent.js` bloqueiam envios persistidamente. Pedidos ambíguos podem exigir intervenção humana; o botão Bloquear também impede envios. Não há desbloqueio automático.

O envio humano entra na fila persistente e usa um identificador para evitar duplicação. A janela de atendimento e o bloqueio são conferidos novamente ao executar o envio. Uma execução interrompida ou envio de resultado incerto exige conferência; não se tenta reenviar automaticamente.

A Meta aceitar uma mensagem não prova entrega: o painel diferencia aceitação, envio, entrega, leitura e falha, conforme os eventos recebidos pelo webhook. As mensagens novas ficam em `data/events.json`; conversas anteriores à instalação não são importadas da Meta.

### Estado confirmado

- 19 testes automatizados aprovados, com serviços externos simulados.
- QA do painel aprovado no Edge com Playwright: login, contexto, troca de IA, pausa, envio simulado, bloqueio e layout desktop/mobile, sem erros JavaScript.
- HTTPS respondeu 200; consulta de leads sem autenticação respondeu 401.
- Token fornecido foi salvo somente no `.env` de produção e validado em consulta de leitura à Meta: número comercial verificado, plataforma CLOUD_API.
- Provedor inicial escolhido: DeepSeek.
- `PANEL_ONLY=true`: painel publicado, webhook e envio real desativados.

### Para concluir a ativação

1. No `.env` de produção, preencher `WHATSAPP_APP_SECRET` e `DEEPSEEK_API_KEY`; confirmar um modelo disponível na conta em `DEEPSEEK_MODEL`.
2. Configurar e validar o webhook do app da Meta para a URL acima, usando `WHATSAPP_VERIFY_TOKEN` do `.env`, e assinar o campo `messages` e a conta WhatsApp.
3. Alterar `PANEL_ONLY=false` e recriar o container comercial para carregar as variáveis.
4. Fazer um teste real iniciado pelo cliente, confirmar resposta e eventos de entrega. Pagamento/permissões da Meta e saldo da IA ainda dependem desse teste.
5. Como o token foi enviado no chat, substituí-lo antes da operação definitiva.

### Acesso e manutenção

A chave de login é `PAINEL_TOKEN`, no `.env` de produção. Não compartilhar esse arquivo. O servidor guarda dados em `C:\Projetos\prod\agente-comercial\data`; incluir essa pasta em backup, sem publicá-la no Git.

```powershell
cd C:\Projetos\prod\agente-comercial
docker compose -f docker-compose.prod.yml ps
docker compose -f docker-compose.prod.yml logs --tail 100 comercial
docker compose -f docker-compose.prod.yml up -d --build
```

O computador e o Docker Desktop precisam permanecer ligados. Os containers têm reinício automático enquanto o Docker estiver ativo. Executar apenas uma instância do servidor por pasta de dados.

### Validação DeepSeek — 05/11/2026

A chave fornecida foi gravada no `.env` de produção. A API confirmou os modelos disponíveis `deepseek-flash` e `deepseek-v4-pro`. Um teste sintético usando a mesma integração do agente recebeu uma resposta real do modelo `deepseek-flash`. Nenhuma mensagem de WhatsApp foi enviada nesse teste. Continua faltando `WHATSAPP_APP_SECRET`; o sistema permanece em `PANEL_ONLY=true` até concluir webhook e teste ponta a ponta.

### Atendimento ativado — 05/11/2026

A chave secreta válida encontrada no `.env` da raiz do projeto foi sincronizada para produção e validada pela Meta como pertencente ao app Comercial Command. O app não tinha assinaturas de webhook. Foi criada e confirmada uma assinatura ativa de `whatsapp_business_account`, campo `messages`, para `https://comercial.gestorfacil.ia.br/webhook`. A conta WhatsApp já tinha esse app inscrito; a inscrição do outro app da conta foi preservada.

Produção agora usa `PANEL_ONLY=false`, com DeepSeek habilitado. Teste sintético real de chamada de ferramenta e resposta final do DeepSeek aprovado. O adaptador preserva os campos internos de continuação exigidos pela API; esse conteúdo não é exibido no painel nem enviado ao WhatsApp. Os 19 testes automatizados passaram após o ajuste.

A confirmação ponta a ponta com uma mensagem real iniciada pelo usuário ainda depende do envio de teste para o número comercial. Não considerar entrega real confirmada apenas pela configuração do webhook.

### Teste ponta a ponta confirmado — 05/11/2026

O usuário enviou mensagens reais pelo WhatsApp. Foram confirmadas duas mensagens recebidas, duas respostas automáticas aceitas pela Meta e ambas com confirmação `read` (lidas). Os dois trabalhos da fila terminaram com status `done`, sem erro registrado. Assim, foi validado o fluxo WhatsApp → webhook HTTPS → fila persistente → IA → resposta WhatsApp → confirmação de leitura. Não há pendência de credenciais ou webhook para esse fluxo básico; requisitos adicionais da Meta, faturamento, políticas e operação futura continuam sujeitos à conta e ao uso.

## Login, PostgreSQL e relatórios — 05/11/2026

A produção foi atualizada para PostgreSQL em um container dedicado. As tabelas incluem `leads`, `conversations`, `messages`, `deliveries`, `inbox_jobs`, `settings`, `users`, `sessions`, `auth_throttle`, `audit_log` e controle de migrações. Mensagens têm telefone, direção e data indexados para consultas; atributos variáveis e históricos específicos de cada IA usam JSONB dentro do banco.

O login público passou a usar e-mail e senha. Administrador definido pelo proprietário: `gcgean@hotmail.com`. A senha é criada pelo próprio usuário no primeiro acesso; não foi escolhida nem enviada pelo agente. O link local de ativação está em `C:\Projetos\prod\agente-comercial\ACESSO-ADMIN.html`, funciona uma vez e expira 24 horas após o provisionamento da conta. Depois da criação da senha, entrar normalmente no endereço do painel. A aba Minha senha permite alterar a senha; isso revoga as outras sessões. Não há recuperação por e-mail configurada.

As senhas são armazenadas com scrypt e salt aleatório. As sessões usam tokens aleatórios, apenas seus hashes ficam no banco; o navegador recebe cookie HttpOnly/Secure/SameSite=Strict, válido por 12 horas. O banco também registra tentativas de login e ações administrativas. APIs de alteração verificam origem e cabeçalho próprio. Em produção com PostgreSQL, `PAINEL_TOKEN` não dá acesso ao painel/API.

### Migração e verificação

Foi salva uma cópia ZIP dos arquivos JSON antes da importação, em `backups/`. A importação foi transacional e marcada no banco para evitar repetições: 1 contato, 1 histórico de conversa, 18 mensagens, 9 confirmações e 9 trabalhos de fila. Os arquivos anteriores foram preservados. Após a ativação do banco, uma nova mensagem foi recebida e respondida; a fila concluiu o trabalho e a Meta confirmou leitura da resposta, elevando o total a 20 mensagens e 10 trabalhos concluídos.

Foram aprovados 20 testes, incluindo PostgreSQL real, repetição da migração, atualizações concorrentes, confirmação fora de ordem, proteção de login, sessão, CSRF, limitação de tentativas e relatórios. O teste no navegador validou primeiro acesso, retorno ao login, restauração de sessão, troca de senha, contexto, pausa, envio simulado, bloqueio, relatórios, exportação e layout desktop/mobile.

### Relatórios iniciais

A aba Relatórios permite filtrar até 366 dias e mostra novos contatos, mensagens recebidas, saídas registradas, entregas, leituras, falhas, volume diário, interesse atual dos novos contatos e pendências atuais da fila. Exporta mensagens em CSV com neutralização de fórmulas para planilhas; exportações ficam na auditoria. Os relatórios consideram os registros a partir da instalação/migração; não importam conversas históricas inexistentes no sistema. Não são relatórios financeiros nem de vendas fechadas.

### Containers e backup

- `command_comercial_prod`: aplicação e painel.
- `command_comercial_postgres`: PostgreSQL 17, sem porta publicada, volume `command_comercial_postgres_data`.
- `command_comercial_tunnel`: túnel do domínio comercial.
- `command_comercial_backup`: backup PostgreSQL a cada 24 horas, arquivos em `C:\Projetos\prod\agente-comercial\backups`, retenção de 14 dias.

O primeiro dump foi gerado e sua estrutura foi validada com `pg_restore --list`. O backup no mesmo computador não cobre perda do disco/computador; copiar os arquivos de backup para outro dispositivo como parte da operação.

Não excluir o volume PostgreSQL nem executar `docker compose down -v` durante atualizações. Para restaurar, parar a aplicação, guardar um dump do estado atual e usar `pg_restore` no banco correto antes de retomar o serviço. Não reativar o armazenamento JSON como retorno automático: ele não contém as mensagens recebidas após a migração.

## Múltiplos números, histórico e IARA — 05/11/2026

O painel passou a abrir a primeira conversa automaticamente, permitir clicar na linha inteira, buscar mensagens no histórico e filtrar contatos por interesse e atendimento. Mensagens novas distinguem cliente, IARA, equipe e eventos de sistema; mensagens antigas sem autoria comprovada aparecem como Equipe / IARA. O operador pode ajustar quente/morno/frio/A qualificar, pedir reavaliação pela IA, ver o motivo e registrar um resultado confirmado para as análises. O interesse em produtos é salvo com os dados do lead, sem exigir entrevista.

Cada conexão WhatsApp tem contexto, provedor, leads, histórico, confirmação, bloqueio e fila próprios. As chaves dos registros passaram a incluir a conexão; o mesmo contato pode conversar com dois números sem cruzar seus dados. Os registros anteriores pertencem à conexão Comercial Command. Contextos têm cadastro separado, versões e vínculo com os números. Contextos compartilhados são editados conscientemente pelo operador; a aprovação de aprendizado cria um contexto separado para a conexão analisada.

Novos números são cadastrados pausados e precisam estar registrados/conectados na Cloud API da Meta. O botão Validar Meta e ativar valida credenciais/estado do número e configura webhook/assinatura da conta. A plataforma não remove um webhook de outro sistema silenciosamente. Tokens específicos de novas conexões são cifrados com AES-256-GCM; a chave CONNECTIONS_ENCRYPTION_KEY fica no .env e deve ser preservada em local seguro junto com o plano de restauração. As credenciais nunca são devolvidas à interface.

### Aprendizado com aprovação

O proprietário escolheu revisar e aprovar no painel. O monitor consulta diariamente cada conexão ativa, usando janela de 30 dias e mínimo operacional de 10 contatos e 30 saídas antes de solicitar uma sugestão à IA. Também existe análise manual. As sugestões incluem resumo, limitações e ajuste proposto; não são treinamento do modelo nem prova causal de aumento das vendas. Não há autoaplicação. Aprovar cria um novo contexto só para aquela conexão, e Desfazer restaura o vínculo anterior quando não houver edição posterior. Propostas de contexto desatualizado são recusadas.

A taxa de retorno observa a próxima mensagem do cliente em até 48 horas após uma saída. Saídas recentes sem tempo suficiente não entram no denominador. Fechamentos dependem do resultado marcado pelo operador; a IA não confirma uma venda por conta própria. O arquivo histórico de outro sistema não foi misturado às métricas operacionais atuais.

### Histórico fornecido e contexto

O arquivo RAR do proprietário foi analisado por duas varreduras integrais e amostragem comercial dirigida. Contagens e checksum conferem com o manifesto. A revisão e os limites estão em docs/analise-historico.md. Não foram importados os 1,88 milhão de registros como leads novos nem copiados os 5 GB para produção. O contexto IARA está em server/roteiro-comercial.md: identidade IARA, conversa natural, produto/necessidade, convite rápido à apresentação, agendamento sujeito à equipe, sem preços históricos ou perguntas de credenciais de suporte.

O proprietário adiou o lançamento em CRM externo para outra etapa. A plataforma mantém seu cadastro e histórico internos, mas não afirma registrar em um CRM externo nem reservar agenda que não está integrada.

### Validação

21 testes passaram, incluindo isolamento entre números, histórico, prompts, filas, bloqueios, criptografia das credenciais, replays de webhook, proteção de assinatura e aplicação/desfazer de sugestões. O QA no navegador validou o cadastro de contextos/números, alternância sem cruzar históricos e aprovação/desfazer. Teste real com DeepSeek e contatos sintéticos confirmou nome IARA, coleta de produto, classificação quente e encaminhamento; todos os envios de WhatsApp desse teste foram simulados.

### Publicação confirmada da atualização

A migração multi-connections-v1 foi concluída em produção. As 20 mensagens existentes continuam na conexão default (Comercial Command); o usuário administrador e seu acesso foram preservados. O contexto exclusivo dessa conexão foi criado com a revisão IARA do histórico e está ativo. A nova imagem foi iniciada após parar a aplicação e gerar um dump consistente before-multi, validado com pg_restore --list. A imagem anterior também foi preservada como command-comercial:before-multi-20261105.

O endpoint público de saúde confirmou modo live com PostgreSQL. As rotas de conexões, contextos e aprendizado retornam 401 sem sessão. Não foram cadastrados números reais adicionais nem enviados convites/mensagens de teste a clientes. Os próximos números devem ser cadastrados e validados na interface pelo operador.

Classificações já existentes são preservadas. Reavaliação de histórico antigo por IA é uma ação separada; não se deve afirmar que foi executada sem conferir o resultado. O operador pode ajustar a temperatura no painel ou solicitar Reavaliar com IA.
