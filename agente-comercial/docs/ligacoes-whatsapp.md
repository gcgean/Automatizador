# Ligações WhatsApp para a equipe

O painel faz e recebe ligações pelo WhatsApp Business Calling API, com áudio WebRTC no navegador do atendente. A IARA não atende as ligações. As credenciais da Meta permanecem no servidor. O aplicativo não grava o áudio.

## Usar

1. Abra o painel em HTTPS e selecione a conexão WhatsApp.
2. Clique em **Ativar atendimento de ligações** e permita o microfone no navegador.
3. Mantenha o painel aberto. Ao receber uma chamada, clique em **Atender** ou **Recusar**.
4. Para ligar, selecione um contato e clique em **Ligar**. Se necessário, o painel oferece enviar uma solicitação de autorização. Após o cliente autorizar no WhatsApp, clique em **Ligar** novamente.
5. Durante a ligação, use **Silenciar**, **Ouvir ligação** (se o navegador bloquear a reprodução) e **Encerrar**.

As ligações de saída exigem autorização atual do cliente. O servidor consulta a autorização e os limites na Meta antes de originar a chamada. Solicitações livres de autorização exigem uma mensagem recebida nas últimas 24 horas. Fora dessa janela, peça que o cliente envie uma mensagem; esta versão não envia templates de autorização.

Ao assumir uma chamada ou iniciar uma ligação, o contato passa para atendimento humano e a IA é pausada. O encerramento da ligação não retoma a IA automaticamente. O servidor reserva a chamada para um atendente e uma aba específicos. Uma conta não pode originar ou assumir duas chamadas ao mesmo tempo.

## Configuração inicial do número padrão

Após publicar o backend e o frontend, na pasta do agente comercial:

```powershell
node scripts/configurar-chamadas.mjs --check
node scripts/configurar-chamadas.mjs --prepare
node scripts/configurar-chamadas.mjs --enable
```

`--prepare` preserva o webhook atual e suas assinaturas, acrescenta `calls` e habilita chamadas com o ícone oculto. `--enable` torna o recebimento visível no WhatsApp e habilita solicitações de retorno. O script recusa alterar um webhook que não corresponda a `PUBLIC_URL`. Use `--disable` para desativar as chamadas desse número.

Administradores também podem habilitar/desabilitar chamadas da conexão selecionada no painel. A assinatura `calls` precisa estar configurada no aplicativo Meta correspondente. Em novas conexões com outro aplicativo, configure essa assinatura no aplicativo correto antes de habilitar o recebimento.

## Acesso e rede

- PostgreSQL e sessão autenticada são obrigatórios. A tabela `whatsapp_calls` é criada automaticamente, sem alterar conversas existentes.
- Administradores e operadores padrão têm acesso. Para grupos personalizados, conceda **Fazer e receber ligações WhatsApp** e acesso à conexão desejada. Visualizadores não atendem chamadas.
- Use um navegador atualizado, microfone e preferencialmente fones de ouvido. O navegador precisa permitir microfone e reprodução de áudio.
- Se a rede bloquear WebRTC, configure um serviço TURN controlado pela empresa usando `CALL_ICE_SERVERS`, como um array JSON de objetos RTCIceServer. Essas configurações são entregues apenas aos atendentes autenticados com permissão de chamadas. Não coloque credenciais reais no Git. O padrão é `[]`.
- Ao fechar o painel ou perder a sessão, o servidor tenta encerrar a chamada após 45 segundos sem confirmação do navegador. Chamadas sem atendente expiram após aproximadamente 75 segundos. Sem acesso à Meta, o encerramento remoto depende da recuperação da API.
- Requisições de origem são identificadas por UUID e não são repetidas automaticamente. Se o resultado for incerto, aguarde a atualização; o sistema mantém a reserva e permite solicitar o encerramento.
- As últimas chamadas ficam no painel. Dados de negociação de áudio são removidos quando a ligação termina. Esta versão não oferece transferência de voz, gravação, fila de ramais nem atendimento automático pela IA.

## Verificação

```powershell
$env:TEST_DATABASE_URL='postgresql://postgres:qa-local-only@127.0.0.1:5548/postgres'
npm test
npm run build
```

Os testes usam PostgreSQL isolado na porta 5548 e a API Meta simulada. Testes de navegador validam áudio WebRTC entre pares locais; não substituem uma ligação real para conferir áudio nos dois sentidos, firewall e disponibilidade do número.

Referências: [Meta Calling API](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/), [Configuração de chamadas](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/call-settings), [Permissões do cliente](https://developers.facebook.com/documentation/business-messaging/whatsapp/calling/user-call-permissions).
