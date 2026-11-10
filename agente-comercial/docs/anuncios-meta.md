# Qualificação comercial e anúncios que abrem o WhatsApp

Em **Dados do lead → Qualificação comercial**, a equipe pode confirmar **Negócio gerado / qualificado** ou **Descartar lead**, informando o motivo. O descarte arquiva o atendimento e interrompe a cadência; não altera o negócio externo no CRM. A classificação humana é independente da temperatura sugerida pela IARA.

Em **Configurações → Anúncios Meta**, o administrador conecta os eventos por conexão. O servidor consulta o conjunto de dados da WABA e cria um somente se ainda não existir. Usa o token criptografado já associado à conexão, com a permissão `whatsapp_business_manage_events`. Não altera webhooks nem campanhas e não reenvia classificações antigas ao ativar.

O webhook assinado preserva `referral.ctwa_clid`, `source_id` e a data do anúncio por contato e conexão. Um clique posterior substitui a atribuição anterior; uma entrega atrasada ou repetida não a regride. O clique é capturado mesmo com a IA pausada. Contatos antigos cujo clique não foi preservado não têm sua origem reconstruída ou inventada.

Ao confirmar um lead qualificado, o servidor registra `QualifiedLead`, com `action_source=business_messaging`, `messaging_channel=whatsapp`, o identificador do clique e a WABA. O evento não contém texto da conversa, telefone, motivo de descarte ou observação. **Recebido pela Meta** significa que a API confirmou `events_received=1`, não que o evento já foi atribuído a uma campanha ou utilizado na otimização.

O descarte fica no painel. Não enviamos um evento `Disqualified` inventado para o fluxo Business Messaging, nem prometemos que a Meta excluirá todos os públicos semelhantes. Descartar após um evento recebido não o desfaz. No Gerenciador de Anúncios, é necessário conferir a disponibilidade e configurar a otimização compatível com a campanha; a integração não muda orçamentos, objetivos ou segmentações.

**Enviar venda confirmada à Meta** está disponível após um negócio ganho no CRM. O servidor consulta seu registro confirmado e usa o código e valor persistidos para `Purchase`, em BRL. A ação de qualificar não conta como compra e não fecha o CRM.

Os eventos têm uma chave única por qualificação do contato e por compra/negócio. Uma fila persistente registra `queued`, `sending`, `sent`, `error`, `uncertain`, `skipped` ou `cancelled`. Desativar a integração ou descartar antes do envio cancela eventos ainda na fila. Eventos recebidos, em envio ou incertos não são repetidos. Uma confirmação humana posterior pode preparar novamente eventos antes recusados, cancelados ou sem configuração/origem, mantendo a chave única. Envios incertos precisam de conferência no Gerenciador de Eventos; não há repetição automática, inclusive após reinício. Eventos com mais de sete dias na fila são cancelados.

Os controles respeitam o responsável pelo contato e a exceção administrativa. A configuração exige administrador; qualificar/descartar exige `leads.manage`; transmitir venda exige `deals.manage`.

Referências: [SDK oficial: eventos e canal](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/serverside/event.py), [SDK oficial: conjunto de dados da WABA](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/whatsappbusinessaccount.py), [API de Conversões para Business Messaging](https://developers.facebook.com/documentation/ads-commerce/conversions-api/business-messaging/).
