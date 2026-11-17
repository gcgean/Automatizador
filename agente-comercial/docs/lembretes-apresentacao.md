# Lembrete de apresentação — 30 minutos antes

O sistema agenda um lembrete único para cada apresentação confirmada pela integração. O processador confere a fila a cada 30 segundos e envia pelo mesmo número que realizou o atendimento. Os registros são separados por empresa, conexão e cliente.

Mensagem: “Olá! Sua apresentação com nossa equipe está agendada para [data], às [horário] (horário de Brasília). Passando para lembrar do nosso encontro. Se precisar alterar o horário, responda por aqui.” O texto é determinístico, evitando que a IA invente datas, links ou preparativos da equipe.

Antes de enviar, a plataforma consulta o agendamento externo pelo ID e confere situação ativa, data, horário, apresentador, duração e referência da reserva. Reserva cancelada, removida ou alterada não recebe o lembrete do horário antigo. Alterações feitas diretamente na agenda externa não geram automaticamente um novo lembrete de remarcação nesta versão; uma nova reserva confirmada pela ferramenta recebe seu próprio lembrete.

O aviso respeita descadastro/bloqueio do contato, descarte do lead, situação da empresa/conexão, agenda e habilitação do recurso. Apresentações em atendimento humano podem receber o lembrete transacional; isso não retoma a IA nem a cadência comercial. Não depende do consentimento de marketing da cadência: trata-se de um aviso do compromisso confirmado solicitado pelo cliente. O processamento acontece na mesma fila de mensagens do contato.

Dentro de 24 horas da última mensagem recebida, usa texto. Fora desse período, usa o modelo **lembrete_apresentacao_30min_v1**, pt_BR, categoria UTILITY, com data e horário como parâmetros. A ativação exige esse modelo aprovado na conta WhatsApp da conexão. Aprovação pode ser revogada pela Meta; indisponibilidade impede o envio fora da janela.

Lembretes pendentes persistem no PostgreSQL e são retomados após reinício. Há tolerância de até cinco minutos para atraso no processamento; depois disso, o aviso é marcado como não enviado. Não há disparo após o início do compromisso. A solicitação de envio é feita uma única vez; resultado incerto exige conferência e não dispara repetição automática. Aceitação pela Meta não comprova entrega; o histórico normal registra as confirmações do WhatsApp.

Somente reservas confirmadas registradas nesta ferramenta são consideradas, incluindo futuras já existentes quando o recurso é habilitado. Não há importação de compromissos gerais da agenda externa nem criação de eventos por este processador.

Rotas, com sessão, acesso à conexão e permissão de agenda:

- GET/POST /agenda/reminders/settings?connection=ID: consultar ou ativar/desativar com {"enabled":true/false}.
- GET /agenda/reminders?connection=ID: consultar resultados dos lembretes; atendimentos reservados respeitam a visibilidade do responsável.

Conexões novas começam com o recurso desativado e exigem modelo próprio aprovado. Testes usam PostgreSQL isolado e transportes simulados; não enviar mensagens para clientes como teste.

Quando a Meta ainda estiver analisando o modelo, é possível registrar o pedido de ativação com {"enabled":true,"waitForApproval":true}. A configuração permanece com enabled=false e activation_pending=true. O próprio processador verifica a aprovação e ativa quando o modelo estiver aprovado como UTILITY. Desativar cancela esse pedido. A conferência persiste após reinícios e respeita empresa/conexão ativa.

Publicação verificada em 12/11/2026: modelos aprovados como UTILITY nas contas Command e Cilos; recurso habilitado nas duas conexões, sem ativação pendente. A Command tem agenda integrada ativa e dois lembretes futuros programados. A Cilos ainda não tem configuração de agenda integrada; o envio depende dessa configuração e de reservas confirmadas. Serviço saudável e fontes em execução conferidas. Contexto comercial Cilos atualizado para a versão 9 com histórico/cópia anterior; contexto Command preservado. Nenhuma mensagem real foi enviada como teste.

Pedidos explícitos de desistência/cancelamento recebidos na conversa interrompem os lembretes já na entrada da fila, inclusive durante atendimento humano. A reserva fica marcada como cancelamento solicitado e a equipe deve conferir a liberação na agenda externa. A integração atual não documenta uma operação de cancelamento externo; o sistema não executa uma exclusão adivinhada nem afirma ter liberado o horário.
