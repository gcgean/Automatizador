# CRM interno por empresa

A aba CRM fica ao lado de Conversas. Cada empresa tem seu próprio funil, inicialmente Novos contatos, Em qualificação, Apresentação e Proposta. O administrador pode alterar nomes e cores das quatro etapas.

Oportunidades têm título, contato e conexão de origem, responsável, valor estimado em reais, etapa, situação, próxima ação, data de contato em Brasília e anotações. Arraste o cartão ou altere a etapa no formulário. Ganhos e perdas ficam em guias próprias; perda exige motivo. O botão Abrir conversa retorna ao atendimento do número correto. Não envia mensagens ao criar ou editar uma oportunidade.

Contatos ativos com interesse reconhecido geram uma oportunidade automática por conexão/telefone. A migração inicial abrange até 5.000 contatos elegíveis; novos reconhecimentos são sincronizados durante o atendimento. Contatos já ganhos/perdidos ou com descadastro não entram automaticamente. Etapas ajustadas pela equipe são preservadas. Oportunidades manuais adicionais podem usar o mesmo contato. Uma etapa chamada Apresentação não comprova reserva: somente a integração de agenda confirma agendamentos.

Os indicadores refletem os dados visíveis e os filtros de busca, responsável e conexão: quantidade e valor em aberto, contatos distintos com retorno vencido e valor dos negócios ganhos no mês corrente de Brasília. Trocar a guia de situação não muda a abrangência desses indicadores. O quadro exibe até 300 oportunidades por consulta; use filtros para localizar as demais. Totais de coluna correspondem aos cartões exibidos. Valores estimados não são receita realizada, pagamento ou emissão fiscal.

A permissão pipeline.view permite consultar; pipeline.manage permite criar/editar/anotar. Perfis legados de operador recebem ambas; visualizador recebe consulta; grupos personalizados precisam de concessão explícita. Administradores configuram as etapas. Empresa, conexões autorizadas e privacidade de atendimento são verificados na API e nas métricas. A atribuição de uma oportunidade não transfere o atendimento; contatos reservados continuam acessíveis somente ao atendente responsável e administradores.

Os dados usam tabelas pipeline_stages, pipeline_opportunities e pipeline_notes com vínculos de empresa e controle de versão contra sobrescrita concorrente. Não altera nem substitui o Cilos CRM externo. Ganhar/perder neste quadro não encerra a conversa nem altera o negócio externo. Não há propostas, anexos, importação, exclusão ou sincronização bidirecional nesta versão.

Validação: 102 testes automatizados aprovados em PostgreSQL local isolado, incluindo separação por empresa, privacidade, concorrência, notas e métricas; fluxo visual verificado separadamente com dados fictícios e sem mensagens reais.
