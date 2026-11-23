# Testes e acompanhamento comercial

Implementação de 23/11/2026. A configuração fica em **Configurações → Teste e comercial**, por conexão. O Telegram é configurado por empresa. O catálogo de empresas clientes começa vazio; os exemplos da operação proprietária não são compartilhados com outras empresas.

## Catálogo e páginas

Cada produto possui tags, benefício, página comercial, entrada e condições de teste confirmadas, primeiro passo, modelo de cadência e chave própria de integração. As páginas `/conhecer/:conexao/:produto` usam somente informações comerciais, com acesso ao teste quando confirmado ou contato com a equipe. Não liberam contas e não habilitam módulos.

O cadastro público do Command por módulo, as condições do CRM e a demonstração da HELENA permanecem sujeitos a confirmação. Frotas e Chat têm condições documentadas na base comercial. Não anunciar teste inexistente. Sem interesse específico, o destino é a apresentação geral do ERP ou o catálogo Cilos, sem criar uma tag de interesse por inferência. URLs configuradas usam HTTPS público sem credenciais ou parâmetros. Edição concorrente do catálogo exige atualizar a versão.

## Conversas e cadência

Pedidos explícitos como “pode ligar”, “estou disponível” e “quero contratar” têm prioridade sem exigir temperatura quente. A atribuição ainda exige expediente, disponibilidade, sessão, permissões e setor compatível. Sem elegível, o pedido permanece sinalizado e a IA oferece o destino pertinente. O vendedor assume pelo aviso na conversa ou pelo acompanhamento comercial. Responder manualmente registra início de atendimento. Uma varredura sinaliza falta de aceite após um minuto ou falta de resposta em três minutos; não há promessa de prazo ao cliente nem redistribuição forçada de responsáveis.

O convite ao produto usa um modelo de marketing aprovado por produto: texto estático com o destino confirmado ou um único parâmetro de corpo `{{1}}` contendo link individual. Não admite cabeçalho/botões nesta automação. A retomada manual já possui suporte próprio a outros componentes. A aprovação é revalidada antes de cada envio. Um convite individual já enviado ao produto não é repetido. Falta de modelo específico aprovado conserva a sequência geral disponível, sem transformar texto livre em template.

Após cadastro confirmado, os modelos `cadencia_primeiro_uso_v1` e `cadencia_avancar_contratacao_v1`, quando aprovados, substituem o convite de cadastro. Possuem um parâmetro de corpo com o nome do produto. Contratação confirmada interrompe a cadência desse interesse. Cadastro ou uso confirmado impede finalizar automaticamente por silêncio no WhatsApp; o acompanhamento comercial permanece aberto. Evento confirmado pode reabrir somente um encerramento anterior por falta de resposta da cadência, preservando encerramento manual, recusa, bloqueio e ganho/perda. Cadastro, ativação, dificuldade e contratação geram aviso interno ao responsável ou, sem responsável, aos administradores; o Telegram pode entregar esse aviso quando configurado. Recusa, bloqueio e controle humano continuam impedindo envios. O script `scripts/reconciliar-recusas.mjs` identifica recusas explícitas em acompanhamentos ativos; sem `--apply` apenas conta, com `--apply` interrompe, bloqueia e audita. Não envia mensagens.

## Integração de cadastro e uso

1. No catálogo, gere a chave do produto. Guarde-a **somente no servidor de origem**. A chave é exibida uma vez e fica cifrada no comercial. Rotacionar invalida a anterior.
2. No frontend do produto, capture `commercial_ref` da URL e preserve-o até o cadastro. O auxiliar `shared/commercial-ref.js` pode ser reutilizado. Não enviar telefone/e-mail ao analytics ou em parâmetros do link.
3. Na transação que confirma a criação da conta, registre um evento numa outbox persistente do produto. Envie depois do commit com `scripts/commercial-product-client.mjs`, preservando o mesmo `eventId` nas tentativas.
4. O primeiro evento precisa do `ref`. Depois da associação, bastam o `accountId` estável e os demais campos. A mesma conta não pode ser reatribuída a outro lead por outro link. Não inferir cadastro a partir do clique.

Endpoint: `POST /product-events/:conexao/:produto`. Cabeçalhos `X-Commercial-Timestamp` (segundos Unix) e `X-Commercial-Signature`: `sha256=` seguido do HMAC SHA-256 de `timestamp + '.' + corpo JSON exato`, usando a chave. A tolerância do timestamp é de cinco minutos. Exige conexão e empresa ativas. O corpo é limitado a 16 KiB.

Campos: `eventId`, `accountId` (identificadores internos opacos), `kind`, `occurredAt` em ISO; `ref` no primeiro vínculo; opcionais `trialEndsAt` e `errorCode` sem texto pessoal. Não incluir nome, telefone, senha, conteúdo de clientes ou detalhes sensíveis. Tipos aceitos: `signup_completed`, `trial_started`, `first_login`, `activation_completed`, `session_started`, `usage_error`, `subscription_started`, `trial_expired`, `subscription_cancelled`.

`activation_completed` deve representar uma ação útil definida pelo produto, como uma oportunidade no CRM ou um veículo no Frotas. Não usar acesso à tela como ativação. Acesso ao link pode ser feito por verificadores automáticos; não comprova interesse humano. Ausência de eventos é ausência de observação, não abandono comprovado. O painel mostra até 100 acompanhamentos e tarefas sugeridas; ainda não substitui uma ferramenta de análise de aquisição completa ou GA4.

## Telegram

Criar um bot no Telegram, registrar seu token no formulário protegido e vincular os Chat IDs aos usuários da empresa. Cada destinatário precisa iniciar o bot ou adicioná-lo ao grupo autorizado. Para receber pendências de gestão, marcar o destinatário e usar um administrador com acesso às conversas. Vendedores recebem notificações de atribuição. O botão abre a conversa autenticada no painel, onde é possível assumir; não há comando de assumir diretamente pelo Telegram.

Token e Chat IDs são cifrados. O aviso é genérico e não contém nome/telefone do cliente. Permissões, vínculo e empresa são revalidados antes do envio. Cada notificação/destinatário tem captura persistente; timeout fica incerto e não é repetido automaticamente. Aceitação pela API do Telegram não comprova leitura ou atendimento. As notificações internas continuam disponíveis.

## Validação e dependências

Testes em PostgreSQL isolado e API Telegram simulada cobrem assinatura, replay, cadastro idempotente, isolamento, link individual, prioridade, disputa de responsável, catálogo concorrente e recusa. Nenhuma mensagem real é usada como teste. Integrações de origem dependem de acesso ao código dos respectivos produtos; gerar a chave não instala o emissor nesses sistemas. Google Analytics depende de definição de propriedade e acesso específicos; não foi presumido nem configurado sem esses dados.
