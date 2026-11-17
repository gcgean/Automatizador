# Retomar atendimento após 24 horas

Na conversa com janela encerrada, use **Retomar com modelo aprovado**. A plataforma consulta os modelos APPROVED da WABA da conexão. O modelo configurado na cadência é a opção inicial quando disponível; o atendente pode escolher outro modelo aprovado. A retomada manual funciona mesmo com a cadência desativada. O atendente confere a prévia e confirma a autorização do cliente para este contato. Só então **Enviar modelo aprovado** coloca o envio na fila.

O texto aprovado não pode ser editado, receber assinatura adicional nem ser trocado por texto livre. A prévia acompanha os campos preenchidos: variáveis de texto numeradas ou nomeadas do corpo/cabeçalho, link HTTPS de mídia IMAGE/VIDEO/DOCUMENT e complemento de URL dinâmica em botão. Botões estáticos são mantidos no modelo aprovado. Modelos incompatíveis (por exemplo autenticação, localização ou botões não suportados) aparecem com motivo e envio bloqueado. Use o modelo conforme sua finalidade; aprovação não autoriza mudar marketing para utilidade. O envio manual não concede autorização para cadência automática.

Permissões da empresa, conexão, atendente e conversa são revalidadas no processamento. Descadastro, recusa, empresa/conexão pausada e falta de autorização bloqueiam o envio. Repetir o mesmo identificador não duplica a solicitação. Envio incerto exige conferência na fila, sem repetição automática.

Se o cliente responder enquanto a prévia está aberta ou antes de o envio ser processado, a janela reabre; use a mensagem normal. Enviar um modelo não reabre sozinho as 24 horas. A janela é contada desde a última mensagem do cliente.

A lista é paginada com chamadas somente ao domínio Graph da Meta e às credenciais da conexão. A aprovação, a versão do modelo, os parâmetros e as permissões são conferidos no enfileiramento e novamente antes do envio. Envios já enfileirados com o mesmo identificador não são duplicados. Não há alteração de WABA ou compartilhamento de modelos por nome de empresa.

O histórico registra texto final, responsável e modelo; a fila mantém falhas/entregas incertas para conferência. Respostas síncronas da API mostram o código da Meta; falhas posteriores recebidas por webhook mostram código e motivo na conversa (incluindo 131049 e 131047). Uma mensagem aceita ainda depende da entrega e não abre a janela de texto livre. O painel de retomada tem contraste próprio nos temas claro e escuro e informa explicitamente recusa de acompanhamento.

## Verificação de cadência

A cadência automática exige habilitação, modelo MARKETING aprovado sem campos dinâmicos, lead elegível com pergunta pendente e autorização de acompanhamento registrada. Habilitar a função não concede autorização aos contatos existentes. Sem autorização o estado é consent_required, sem tentativas de envio. Ao registrar autorização nos dados do lead, o sistema reavalia a última pergunta; atendimento humano, recusa ou encerramento continuam impedindo a programação. A retomada manual não habilita nem autoriza a cadência automática.
