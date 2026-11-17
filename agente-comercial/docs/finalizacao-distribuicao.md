# Finalização e distribuição de conversas

## Organização

O botão Finalizar (nome acessível Finalizar conversa) no cabeçalho move o contato para Finalizadas. Reabrir conversa restaura a lista conforme atendimento humano/IA e resultado comercial existentes. A operação local registra autor e data em auditoria e campos separados no lead; não chama a API de Conversões, não desqualifica, não perde/ganha o negócio e não altera autorização/recusa de marketing. Histórico, responsável, qualificação, temperatura e CRM permanecem.

A permissão leads.manage e a visibilidade da conversa são obrigatórias. Confirme ou resolva envios pendentes antes de finalizar. Ao finalizar, a cadência aguardando ou enfileirada é interrompida, a IA deixa de responder ao assunto e o campo manual exige reabertura. Uma nova mensagem recebida reabre na fila correspondente, sem liberar descadastro nem remover responsável. Webhooks duplicados e lembretes automáticos não reabrem. Compromissos confirmados não são cancelados por esse botão e seus lembretes continuam usando as regras da agenda.

## Configuração por empresa

Em Configurações → Horário e distribuição, um administrador escolhe dias e períodos, intervalo, fuso (com a opção Fortaleza / America/Fortaleza) e feriados datados. Dias vazios ficam fechados; o fim do período é exclusivo. Cada período começa e termina no mesmo dia; feriados fecham o dia inteiro. Não há importação de feriados nem repetição anual automática. A configuração começa desativada, sem horários presumidos, e vale para as conexões da empresa selecionada.

Em Configurações → Usuários, marcar Pode receber leads automaticamente da IA para os consultores desejados. O recebimento começa desautorizado para todos. Cada pessoa habilitada usa Disponível para leads no topo para sinalizar disponibilidade; também precisa de sessão ativa, permissão de ver/responder e acesso à conexão. Plataforma visível atualiza presença; após 90 segundos sem atualização deixa de ser considerada online. Sair da sessão impede novas atribuições quando não há outra sessão válida. Suspensão, retirada de acesso e indisponibilidade impedem a seleção.

## Aceite e vínculo

Após responder a um lead quente, o fluxo pode oferecer um consultor durante o expediente, se houver alguém elegível. Não oferece a contato bloqueado, assunto finalizado, lead já atribuído/encaminhado, ganho/perdido, com recusa registrada ou apresentação já agendada. A oferta tem botões Falar com consultor e Agora não, validade de dez minutos e limite de uma oferta por contato em 24 horas. Resposta curta afirmativa só vale se a oferta ainda for a última saída correspondente; perguntas ou cliques antigos não são aceite da oferta atual. Recusar consultor não registra desqualificação nem recusa geral de marketing.

No aceite, o servidor revalida expediente, feriado, lead, permissão e presença. A atribuição e a notificação são gravadas na mesma transação. A menor carga de atendimentos humanos abertos tem prioridade; em empate, prioriza quem está há mais tempo sem receber uma atribuição automática. Um bloqueio por empresa serializa distribuições simultâneas. Sem elegível no aceite, a IA informa a indisponibilidade e continua por ali. Não promete vínculo ou resposta imediata inexistente.

A notificação na plataforma exibe Novo lead vinculado a você e abre a conversa correta. A consulta ocorre a cada dez segundos com a plataforma visível. Só é exibida ao usuário vinculado, dentro da empresa e com acesso atual à conexão e conversa. Pode ser lida/dispensada; não há aviso externo por WhatsApp/e-mail. Há push opcional de navegador/PWA conforme a seção abaixo.

## Verificação

Testes em banco isolado cobrem encerramento sem eventos Meta e com dados preservados, permissões, cadência, duplicidade, reabertura, expediente/feriado, aceite/recusa, vínculo por carga, ausência de pessoa disponível e notificações isoladas. Validação em navegador usa dados fictícios e transporte Meta simulado. Não é comprovação de entrega de mensagem ou tempo de atendimento de consultor real.

## PWA e notificações push

O manifesto permite instalar o aplicativo pelo navegador compatível (Android/computador) ou adicionar à Tela de Início (iPhone/iPad compatível). O menu de notificações possui Ativar notificações neste dispositivo, Desativar e, quando disponibilizado pelo navegador, Instalar aplicativo. A autorização é solicitada somente ao clicar para ativar. No iOS/iPadOS, Web Push exige aplicativo na Tela de Início em versão compatível (a partir de 16.4).

Push usa VAPID com chave privada cifrada no servidor e inscrições cifradas, vinculadas a usuário, empresa e sessão. Endpoints são limitados aos provedores reconhecidos de Chrome/Firefox/Safari/Edge; não há envio para URLs arbitrárias. O processamento é persistido por notificação/dispositivo para evitar repetição. Revalida sessão, empresa, usuário, conexão e vínculo atual do lead. Dispositivos revogados (404/410) são removidos. Falha/aceitação no serviço push é registrada sem presumir entrega ao aparelho. Não há teste de envio real a pessoas como parte da validação do código.

O aviso externo é genérico, sem nome ou telefone de cliente. O clique abre uma URL local com identificador de notificação; a API valida o acesso antes de mostrar ou abrir a conversa. A notificação interna permanece como alternativa. Acesso encerrado ou troca de empresa não permite abrir um atendimento de outro usuário/empresa. O serviço pode entregar com a página fechada quando navegador/sistema permitir, mas depende de internet, permissão e políticas de bateria/execução. Não garantir funcionamento quando o navegador foi forçado a encerrar ou notificações foram bloqueadas no sistema.

O service worker guarda apenas a orientação offline e ícone público; não guarda histórico, dados de clientes, respostas da API nem sessões em cache. Sem conexão, mostra orientação para reconectar. Atualizações mantêm rede como fonte das telas. A navegação principal no celular fica no rodapé, com adaptação para área segura, formulários de toque e tabelas com rolagem própria quando necessária.

Referências: [Web Push da Apple](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers), [biblioteca Web Push](https://github.com/web-push-libs/web-push), [clique de notificação no service worker](https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorkerGlobalScope/notificationclick_event).
