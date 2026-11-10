# Confirmação de envio e fila por contato

Mensagens passam por estados diferentes: na fila, enviando, aceitas pela Meta, entregues e lidas. A indicação de entrega depende do webhook da Meta; receber um identificador de envio não equivale a confirmar leitura.

Durante o envio manual, a conversa mostra **Enviando sua mensagem…**, e a atualização passa para um segundo. **IARA está respondendo…** aparece apenas quando uma mensagem está sendo processada pela IA.

## Envio sem confirmação

Se uma chamada à Meta falhar sem confirmar o resultado, o sistema preserva o envio como incerto e pausa a fila daquele contato. Os outros atendimentos continuam funcionando. Não há repetição automática de mensagens com resultado incerto.

A lista mostra **Conferir envio**, e a conversa exibe o aviso **Envio não confirmado**, com a mensagem original e o que ainda aguarda na fila. Novas tentativas são recusadas com explicação; o rascunho digitado permanece na caixa.

1. Abra **Ver mensagem e pendências**.
2. Confira com o destinatário se a mensagem anterior chegou e resolva esse envio.
3. Cancele tentativas repetidas que ainda estejam na fila, quando necessário.
4. Clique em **Já conferi e resolvi; liberar fila**. A confirmação informa que as mensagens ainda pendentes serão liberadas.

Cancelar uma mensagem é permitido apenas enquanto ela está em `queued`. A captura pelo trabalhador e o cancelamento usam a mesma coordenação da fila, impedindo que uma mensagem cancelada seja enviada numa disputa de execução. A mensagem original de resultado incerto não pode ser cancelada como se nunca tivesse sido enviada.

Resolver ou cancelar pendências exige a permissão **Resolver pendências de envio** e acesso ao atendimento. Os registros são preservados para conferência; não há exclusão de mensagens ou alteração artificial de status de entrega da Meta.
