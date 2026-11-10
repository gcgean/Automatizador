# Melhorar texto com IA

No botão **+** ao lado do campo de mensagem, **Melhorar texto com IA** abre uma janela com o rascunho e três modos: Mais natural, Mais persuasivo e Mais curto. É possível digitar o texto nessa janela, gerar uma sugestão, editá-la e escolher Usar sugestão. Manter rascunho, fechar ou pressionar Escape preserva o original. A mensagem continua dependendo do envio manual na conversa.

A rota POST `/leads/:phone/improve-text?connection=...` usa o provedor configurado na conexão e exige a permissão já existente `messages.send`, além de acesso ao atendimento. O acesso é conferido novamente depois da geração para respeitar transferência e revogação. O rascunho fica fora do histórico e dos eventos de conversa; a auditoria registra apenas a solicitação à função. Não são carregados histórico do cliente ou contexto comercial para a revisão, e não são disponibilizadas ferramentas à IA.

O prompt orienta preservar nomes, números, valores, descontos, links, datas e condições e não inventar produtos, promessas, benefícios ou urgência. O vendedor deve revisar a sugestão antes de usar. Entrada e saída têm limite de 4.000 caracteres. Há uma solicitação simultânea e até oito solicitações por minuto por usuário. Falha, recusa ou saída inválida não altera o rascunho e não expõe detalhes internos do provedor.
