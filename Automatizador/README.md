# Nexo — agente com navegador integrado

Protótipo local para Windows. Electron + Chromium, React e IA via DeepSeek ou Ollama local. O navegador é real, incorporado com WebContentsView; não usa iframe para sites externos.

## Abrir

Requer Node.js 22.12 ou superior e internet na primeira instalação.

Clique duas vezes em **iniciar.bat**, ou execute nesta pasta:

```powershell
npm install
npm start
```

## Primeiro teste, sem chave

1. Mantenha **Demonstração · sem API** selecionado.
2. Clique em **Executar tarefa**.
3. Revise e permita os cliques solicitados. A resposta fica visível antes do envio.
4. Confira a resposta enviada e o cadastro da Marina salvo no site de demonstração.

A demonstração é uma sequência programada fixa que opera o navegador de verdade. Não usa IA nem interpreta a tarefa escrita. Sempre abre novamente a página fictícia e limpa seus dados anteriores.

## Chats salvos e continuidade

Cada conversa com a IA é um chat separado, salvo automaticamente em `C:\Projetos\dev\Automatizador\conversas` (pasta `conversas` ao lado do projeto). A gravação começa a partir desta versão; conversas antigas de versões que só usavam memória não são recuperadas automaticamente.

- Use **Chat salvo** no painel para alternar entre as conversas.
- Em **Atividade → Expandir**, a lista **Chats salvos** mostra as conversas e permite dar um nome ao chat atual.
- **Nova conversa** cria outro chat e preserva o anterior.
- O ícone de pasta abre os arquivos no Explorador do Windows.
- Ao reabrir o Nexo, o último chat é carregado com mensagens, histórico de ações, contexto da IA, rascunhos, modo de execução e opção de revisão. O último endereço do site também é aberto; o estado interno de formulários ou abas que não aparecem na URL pode precisar ser reaberto manualmente.
- O histórico completo continua disponível na interface; no Ollama, a janela de contexto enviada ao modelo mantém os limites de desempenho descritos abaixo.

Cada chat tem um arquivo `.json` para recuperação e uma cópia `.md` para leitura em editores de texto. Os nomes dos arquivos usam identificadores estáveis; o título aparece dentro deles e na lista do aplicativo. As mensagens são arquivos locais de texto; a chave de configuração da API continua no armazenamento criptografado separado. A pasta `conversas` é ignorada pelo Git.

Trocar de chat durante uma tarefa exige interrompê-la primeiro. Fechar durante uma execução salva o histórico e marca a execução como interrompida. Reabrir **não** retoma cliques nem envios automaticamente: envie uma nova instrução para continuar, e o agente lerá a página atual. Todos os chats compartilham o mesmo perfil de login do navegador, mas possuem contextos de IA separados. Falhas de gravação são mostradas na interface; arquivos de chat inválidos são preservados.

## Usar DeepSeek em sites reais

1. Abra **Configurações**, informe a chave da API DeepSeek e um modelo disponível na sua conta (padrão `deepseek-flash`). Não envie sua chave pelo chat.
2. Selecione **DeepSeek · API real**.
3. Digite o endereço do site na barra e clique em **Abrir**. Entre na sua conta manualmente, quando necessário.
4. Escreva uma tarefa específica: “Leia a conversa aberta e preencha uma resposta. Não clique em enviar.” Ou: “Preencha o nome e o e-mail deste cadastro com os seguintes dados ...”.
5. Clique em **Executar tarefa**. Acompanhe a atividade e revise os cliques, se essa opção estiver marcada. **Parar** cancela a consulta à API e impede as próximas ações; não desfaz ações concluídas.

## Usar Ollama local

1. Deixe o Ollama em execução e instale um modelo com suporte a ferramentas.
2. Em **Configurações**, selecione **Ollama · local**.
3. Informe **Base URL** `http://localhost:11434/v1` e **Modelo** `qwen2.5:3b` (ou outro modelo instalado).
4. Clique em **Testar conexão** para verificar o serviço e a disponibilidade do modelo; depois em **Salvar configuração**.
5. Escolha **Ollama local · API real** no modo de execução, ou envie uma mensagem pelo chat. A demonstração continua disponível como modo separado sem IA.

O Ollama local não exige chave nesta integração HTTP. Uma eventual chave salva do DeepSeek fica separada e não é enviada ao Ollama. O endereço pode usar localhost, 127.0.0.1 ou [::1], com caminho /v1. O Nexo usa esse endereço para verificar os modelos e a API nativa `/api/chat` no mesmo servidor para gerar respostas em streaming. Redirecionamentos da API não são seguidos. A configuração do provedor, endereço e modelo é lembrada ao reabrir. Ao trocar o provedor ou modelo, uma nova conversa é iniciada. A leitura e a execução ainda dependem da capacidade do modelo; modelos menores podem errar seletores ou instruções.

O modo local usa contexto de 4.096 tokens, até 512 tokens por resposta, temperatura 0,2 e mantém o modelo carregado por até 10 minutos após o uso. As decisões estruturadas aparecem após a validação da resposta completa. A espera inicial tem limite de 180 segundos; após começar a receber dados, a execução é interrompida se o Ollama ficar 60 segundos sem enviar outra parte. O botão Parar cancela também o streaming. Uma ferramenta só é executada depois de sua resposta completa ter sido recebida. A mesma busca pode ser executada no máximo duas vezes sem ação intermediária. Após isso, ou após três consultas sem avanço, o modelo precisa escolher uma ação autorizada nos controles já lidos ou encerrar. Leitura, busca e espera ficam bloqueadas nessa decisão, mesmo se relógios ou notificações mudarem na página. Uma ação bem-sucedida libera as consultas novamente.

As mensagens e respostas anteriores são mantidas em cada chat, inclusive depois de reabrir o aplicativo. Para reduzir a demora no Ollama, apenas uma janela limitada do histórico é enviada: relatórios extensos são abreviados, as primeiras orientações são preservadas quando cabem no orçamento e mensagens recentes têm prioridade. A atividade informa quando parte do histórico foi omitida; nesse caso, reforce regras importantes na mensagem atual. O DeepSeek continua recebendo o histórico completo do chat selecionado. O conteúdo da página é lido novamente antes das ações; resultados antigos de ferramentas não são reutilizados como se fossem atuais. **Nova conversa** cria um contexto separado sem apagar os chats existentes.

Antes de cada mensagem para a IA, o Nexo lê automaticamente o título, endereço, texto e ids dos elementos atuais do navegador. A atividade mostra **Página consultada** com o site realmente aberto. Isso também acontece quando o modelo não pede uma ferramenta. No Ollama, as leituras enviadas contêm até 1.800 caracteres de texto e 24 elementos; metadados redundantes são omitidos, preservando ids, campos protegidos, edição de texto e funções ARIA. Para instruções atuais acima de 2.200 caracteres, o texto inicial da página cai para 800 caracteres. Mensagens locais acima de 5.000 caracteres pedem divisão em etapas. No DeepSeek, o limite é de 16.000 caracteres e 180 elementos. Se a página não puder ser lida, a atividade informa a falha. O agente recebe texto do documento, não uma visão por imagem da tela.

Cliques e preenchimentos usam o id do elemento da leitura atual. O aplicativo valida a referência internamente; o modelo não precisa copiar tokens. Referências expiradas, elementos removidos, ocultos ou desabilitados geram um motivo específico. Quando a falha ocorreu antes da ação e pode ser corrigida, a IA recebe uma nova leitura para escolher um elemento válido. Ações com resultado desconhecido não são repetidas automaticamente.

A leitura também detecta abas com funções ARIA, linhas e blocos com cursor de clique ou manipulador de clique, além de botões e links. Os elementos que aparecem na área visível são priorizados, e o texto visível é colocado antes do restante do documento. A ferramenta **find_elements** permite buscar um nome ou texto que ficou fora da leitura resumida; os ids são atualizados após a busca. Elementos cujo texto mudou desde a leitura são recusados para evitar clicar em uma linha reutilizada para outra pessoa. A atividade informa quantos elementos foram detectados. Se a IA só disser que vai agir e encerrar sem executar, o aplicativo informa que nenhum clique foi feito. Essa detecção não garante compatibilidade com todos os sites, iframes ou shadow DOM.

Para um clique específico, prefira: `Clique na conversa "nome exato", sem enviar mensagens.` Quando o usuário pede explicitamente um clique, o nome está entre aspas e a busca retorna um único rótulo exatamente igual, o aplicativo pode encaminhar esse clique mesmo se o modelo não chamar a ferramenta. A revisão de cliques continua valendo. Resultados ambíguos não são escolhidos automaticamente. Fora desse caso, há no máximo uma solicitação adicional ao modelo para corrigir uma conclusão sem clique; se ele não executar, a interface informa a falha. Um resultado de ação desconhecido nunca ativa essa repetição automática.

Para ajustar as orientações, use **Mensagem para a IA** na seção Atividade ou clique em **Expandir** para conversar na janela maior. Exemplo: “Mantenha o tom simpático, mas use respostas mais curtas”. O envio usa o provedor configurado mesmo se a demonstração estiver selecionada. Durante uma execução você pode preparar a mensagem, mas precisa aguardar a conclusão ou clicar em **Parar** antes de enviá-la. As regras de revisão de cliques também valem para pedidos enviados pelo chat.

A chave é salva criptografada pelo sistema operacional em `.nexo-profile/settings.json` e carregada automaticamente ao iniciar. No Windows, a proteção usa DPAPI via Electron safeStorage. A chave não é devolvida à interface nem exposta aos sites. O modelo também é salvo. Deixar o campo de chave vazio mantém a chave existente; use **Remover chave salva** para apagá-la. Se o sistema não puder criptografar, o aplicativo informa a falha e não grava a chave em texto simples. O endpoint da API é fixo: `https://api.deepseek.com/chat/completions`. As chamadas têm limite de 60 segundos e cada tarefa admite até 24 rodadas de IA.

Ao usar a API, o texto da página, os valores dos campos não protegidos e a tarefa podem ser enviados ao provedor selecionado: DeepSeek remoto ou Ollama no endereço local configurado. Campos de senha são ocultados da leitura e não podem ser preenchidos pelo agente. O DeepSeek pode cobrar pelo consumo da sua conta. Cookies e sessões dos sites permanecem na pasta local `.nexo-profile`; dados da demonstração ficam só em memória até recarregar.

No Ollama, todas as mensagens usam desde a primeira resposta uma decisão com JSON Schema: uma ferramenta com argumentos validados ou uma resposta de conversa/encerramento. Isso independe de palavras-chave como “envie” ou “continue”; perguntas e ajustes de tom podem receber apenas uma resposta, sem ações. Depois de cada ação nesse fluxo, o Nexo relê a página automaticamente e devolve o estado atualizado ao modelo. O texto de uma promessa nunca é convertido diretamente em clique ou mensagem. Quando o modelo encerra prometendo uma ação pendente, são permitidas até duas correções após leitura fresca, exigindo avanço real entre elas. Se a leitura falhar, não houver avanço ou existir uma ação com resultado desconhecido, o fluxo para e informa a limitação. O registro separa quantos cliques e preenchimentos ocorreram; uma promessa não conta como envio confirmado.

## Capacidades e limites

As orientações revisadas estão em `orientacoes-ia.txt`. A regra `Filtro do convite: não repetir convite quando o histórico contiver "nosigilo"` permite respostas contextuais nessa conversa e bloqueia a repetição das frases de convite ou da chamada promocional com o termo. Esse modo substitui a exclusão total somente quando aparece nas novas instruções do usuário; regras antigas do tipo `Pular quem já tem "nosigilo"` continuam excluindo a conversa inteira até serem alteradas. A atualização de orientações pode ser salva no histórico e em Sua tarefa sem executar a IA ou enviar mensagens. A revisão de cliques permanece uma configuração do aplicativo, independente do texto das instruções.

O botão Enviar pode começar desabilitado enquanto a mensagem está vazia. A ferramenta de envio inspeciona esse estado, preenche e só clica depois de uma nova leitura confirmar que o mesmo botão ficou habilitado. Um clique direto em controle desabilitado continua sendo recusado.

Para uma resposta de chat autorizada, a ferramenta `send_message` reúne preenchimento e envio. Ela fixa os controles da leitura atual, preenche o texto, relê a página e só então encaminha um clique ao mesmo botão, respeitando a revisão configurada. O envio só é confirmado quando o campo fica vazio e uma nova ocorrência da mensagem aparece no documento. Se os controles mudarem ou o resultado ficar incerto, o Nexo encerra sem repetir o envio. O fluxo termina após uma mensagem confirmada; use uma nova execução para continuar. A compatibilidade com um site específico depende dos controles e da confirmação que ele expõe no documento.

Regras explícitas como `Pular quem já tem "nosigilo" no histórico` são verificadas pelo aplicativo nas mensagens individuais carregadas, sem delegar a comparação literal ao modelo. Na estrutura de conversa identificada no D4swing, as mensagens são separadas da lista de contatos e priorizadas no contexto, com as mais recentes primeiro. O editor e os botões da conversa têm prioridade no resumo mesmo quando estão abaixo da área visível. Uma ocorrência em outro contato ou nas instruções não exclui a conversa atual. Termo encontrado bloqueia preenchimento/envio no editor; histórico não identificado impede o envio com esse filtro. O bloqueio é conferido novamente após a revisão do clique. Ausência do termo não dispensa os outros critérios. Quando a regra exige que a outra pessoa tenha escrito primeiro, uma primeira mensagem carregada de saída ou direção desconhecida não autoriza envio. A verificação cobre mensagens presentes no documento: mensagens antigas ainda não carregadas não foram verificadas. A composição utiliza as instruções do usuário e o contexto atual, sem reutilizar relatórios antigos da IA como prova sobre o histórico.

- Ler texto e elementos, navegar entre sites, preencher campos, selecionar opções, clicar e rolar a página.
- Revisão de cliques e navegação feita pelo agente, ativada por padrão. Desmarcar permite execução automática dentro da tarefa.
- Sites podem exigir login manual, CAPTCHA ou rejeitar navegadores incorporados. Não há garantia de compatibilidade com todos os sites.
- Atua no documento principal. Iframes, shadow DOM, editores complexos, upload de arquivos e autenticação por popup não estão implementados. Links que exigem nova janela são bloqueados; o endereço aparece na atividade para abrir manualmente.
- Não inclui execução em segundo plano, agendamento, atendimento contínuo nem API oficial de WhatsApp.
- Permissões de câmera, microfone, notificações e downloads são bloqueadas no protótipo. Não desativa a segurança de origem do navegador.
- Instruções dos sites são tratadas como dados pelo prompt. Isso reduz, mas não elimina, o risco de instruções maliciosas. Revise as ações em contas reais.

## Desenvolvimento e verificação

Para retornar ao inbox, envie “Volte para a lista https://d4swing.com/threads”. Esse pedido abre a rota diretamente, sem consultar a IA, e só confirma sucesso depois de detectar as conversas carregadas. Se as orientações pedirem retorno após uma resposta ou conversa pulada, o agente também retorna após um envio confirmado ou bloqueio conhecido. Um envio de resultado incerto mantém a conversa aberta para conferência. O retorno não inicia automaticamente o atendimento do próximo contato.

```powershell
npm run build
npm test
npm run test:e2e
npm run test:ollama
npm run test:browser
```

O teste de integração usa Playwright para iniciar o Electron e verificar o navegador incorporado. Há também um teste da integração HTTP com um servidor local simulado; ele não comprova acesso à conta DeepSeek. O DeepSeek real requer uma chave válida e saldo, e não foi validado contra uma conta real neste projeto. `test:ollama` depende do serviço local e do modelo qwen2.5:3b; testa conversa e leitura de dados fictícios, sem enviar mensagens a sites reais.

Os testes de streaming cobrem Unicode em partes, atualização parcial sem duplicar mensagens, cancelamento, resposta interrompida e execução de ferramentas somente após concluir a transmissão. Os testes de contexto verificam limites de histórico e leituras sem alterar os ids dos elementos.

`npm run dev` mostra somente a interface no navegador comum; as ações exigem `npm start`.

Referências: [Electron WebContentsView](https://www.electronjs.org/docs/latest/api/web-contents-view), [DeepSeek tool calls](https://api-docs.deepseek.com/guides/tool_calls/), [Ollama API compatível](https://docs.ollama.com/api/openai-compatibility).

## Robustez da execução

A fila reutiliza a primeira leitura confirmada da conversa ao iniciar a decisão. A paginação interrompe com resultado incompleto após 60 segundos sem progresso, inclusive se o indicador de carregamento ficar preso; ausência de novos itens não comprova o fim da lista. Após clicar em Enviar uma única vez, o aplicativo aguarda até três segundos pela limpeza do editor e nova ocorrência do texto. Sem confirmação, não repete o envio automaticamente. A confirmação indica atualização do documento, não entrega ou leitura pelo destinatário.

Esses mecanismos foram testados com páginas locais controladas. A integração com WhatsApp Web e Instagram ainda exige adaptação e testes próprios de identificação de conversas, mensagens não lidas e controles de envio.

A fila atende as conversas não lidas na ordem inversa da listagem do site (recentes no topo). Antes de abrir destinatários, percorre a paginação e fixa a fila sem duplicados. Se o fim não for confirmado, informa a coleta incompleta e não inicia envios; novas mensagens recebidas depois da coleta ficam para outra execução. A ordem usa a posição na lista, não uma data inferida pelo modelo.
