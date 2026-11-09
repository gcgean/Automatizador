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
| Registro na Cloud API | ✅ com PIN de duas etapas configurado e omitido deste documento (status CONNECTED, plataforma CLOUD_API) |
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
- [ ] Definir um PIN forte e exclusivo (Gerenciador do WhatsApp → número → Configurações → Confirmação em duas etapas).
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

## Layout de acompanhamento e usuários — 06/11/2026

A tela Conversas passou a usar a altura disponível da janela, com lista compacta, prévia da última mensagem, histórico com rolagem própria e resposta sempre acessível. Os dados completos e a classificação do lead abrem em um painel lateral; pendências ficam recolhidas e só aparecem quando existem. No celular, a navegação alterna entre lista e conversa com botão de voltar. A atualização automática do acompanhamento é a cada 5 segundos.

Configurações reúne Conexões e contextos, Inteligência artificial, Usuários e Minha senha. O topo principal fica com Conversas, Relatórios, Aprendizado (administradores) e Configurações.

### Cadastro de usuários

O proprietário escolheu definir conexões por usuário. O administrador pode criar e editar nome/perfil/situação, selecionar as conexões permitidas, desativar contas e gerar novo acesso. Não existe exclusão de histórico ou de auditoria ao desativar uma pessoa.

Perfis:
- Administrador: todas as conexões, configurações, usuários e revisão de aprendizado.
- Atendente: acompanha e responde, classifica e atua nos atendimentos apenas das conexões atribuídas; não altera configurações do sistema.
- Somente leitura: acompanha mensagens e relatórios das conexões atribuídas, sem enviar mensagens ou alterar atendimentos.

A criação gera um link de uso único, válido por 24 horas, para a pessoa definir a senha. Ele é mostrado apenas na resposta ao administrador; não fica nas listagens e não é enviado por e-mail automaticamente. Compartilhar pelo canal escolhido pelo administrador. Gerar novo acesso invalida senha/link anteriores e encerra sessões. Desativar revoga sessões; alterações de conexão são verificadas no servidor a cada requisição. Senha pode ser alterada pelo próprio usuário em Minha senha.

A migração preserva o usuário atual como administrador. O sistema impede desativar/rebaixar o próprio administrador e impediria remover o último administrador ativo. Usuários sem papel administrativo não acessam os cadastros de usuários, prompts de contexto ou funções administrativas, mesmo por chamada direta à API.

### Validação desta atualização

22 testes passaram, incluindo convites, tentativa de elevação de perfil, acesso negado a outro número, leitura sem permissão de escrita, mudança de permissões e revogação de sessões. O QA no navegador passou em desktop, notebook e celular: área útil do histórico, múltiplos contatos visíveis, compositor dentro da tela, configurações, criação de usuário, ativação em outra sessão e conexão limitada ao perfil de leitura. Nenhum usuário real adicional foi criado automaticamente.

Publicação confirmada em 06/11/2026: nova imagem saudável, endpoint HTTPS em modo live, tabela de permissões disponível e /users protegido com 401 sem sessão. A conta original permaneceu administradora, ativa e com a senha preservada. As 20 mensagens existentes foram mantidas. O dump before-users anterior à atualização foi validado. Nenhuma conta real adicional foi criada automaticamente; o administrador pode cadastrá-las pela interface.


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


## Próxima integração: negócios do CRM (solicitada em 07/11/2026)

Objetivo aprovado: após sincronizar o cliente, criar um negócio vinculado, guardar separadamente o ID do cliente e o ID do negócio, e permitir ao gestor marcar ganho/perda do negócio pela plataforma.

Bloqueio confirmado na documentação atual: a seção Negócios e vendas oferece somente GET e a permissão negocios.consultar. Não há contrato para criar negócio, atualizar status, listar funis/etapas para criação nem informar motivos de fechamento. As ações Ganhos/Descartados atuais são locais ao atendimento; não atualizam negócios no CRM.

Contrato necessário do CRM para concluir: rota autenticada de criação vinculada ao ID do cliente, título, funil/etapa/responsável e valor/produtos quando exigidos; chave externa fixa por oportunidade com criação idempotente; retorno contendo ID do negócio e ID do cliente; rota para ganho/perda e eventual reabertura, com regras de valores, datas e motivos; catálogos dos campos obrigatórios e permissões correspondentes. A integração não deve inventar preço ou fechar venda por decisão da IA.

Na implementação futura, só marcar ganho/perda como confirmado no CRM após confirmação da API, guardar as tentativas e erros e tratar timeout de criação sem duplicar oportunidades. O código externo do cliente existente deve continuar intacto; o negócio precisa de identificador próprio. O usuário foi consultado sobre enviar novas rotas ou fornecer o código-fonte do CRM.


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
