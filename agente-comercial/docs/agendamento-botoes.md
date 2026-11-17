# Agendamento com botões no WhatsApp

Atualização de 12/11/2026. Em conexões com agenda integrada e habilitada, novas consultas oferecem horários por botões (até três) ou por lista (quatro ou cinco, conforme o máximo configurado). Não há ajuste adicional na Meta.

Ao escolher, o cliente recebe o resumo com data, horário de Brasília, apresentador e duração, seguido de **Confirmar** e **Outro horário**. Somente confirmar inicia a tentativa de reserva; a disponibilidade é consultada novamente. Outro horário faz nova consulta sem criar reserva. Respostas digitadas continuam disponíveis: número da opção e CONFIRMAR.

Cada clique é vinculado à oferta, ao contato, à conexão e, na confirmação, à mensagem da escolha atual. Botões antigos ou de outra escolha não confirmam uma reserva diferente. Ofertas expiram em dez minutos; ao tentar usar uma oferta expirada, os horários são consultados novamente. As opções só são aceitas depois que a Meta aceita o envio. Mensagens antigas já enviadas como texto não ganham botões retroativamente.

As mensagens interativas são enviadas como resposta ao cliente dentro do atendimento iniciado por ele; esta alteração não habilita envios livres fora da janela permitida. Erro ou resultado incerto no envio não dispara reenvio automático como texto, para evitar duplicação. O painel mantém o resumo textual e os estados de entrega. No simulador, os envios são locais e é possível selecionar por texto.

Validação: PostgreSQL isolado, APIs simuladas e testes do agente completo, incluindo escolha por ID, confirmação posterior, cliques antigos, outro contato, troca de horário e falhas de envio. Não foram enviados testes para clientes reais.

Publicação verificada em 12/11/2026 na VPS ativa: serviço saudável em modo live/PostgreSQL, painel público respondendo HTTP 200, arquivos em execução conferidos com o código validado e 84 testes aprovados. Contexto comercial Cilos atualizado para a versão 7 com histórico e cópia anterior; contexto Command preservado. A apresentação final dos botões no aplicativo do cliente não foi testada com envio real.
