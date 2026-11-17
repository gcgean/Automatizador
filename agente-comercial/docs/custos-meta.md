# Custos Meta por conexão

Administradores acessam Relatórios → Dashboard Meta, escolhem período e conexões e clicam em “Atualizar”. O relatório mostra mensagens, ligações, custos por número, total por moeda e histórico diário. O filtro desta área é independente da conexão usada no relatório de atendimentos.

Os valores são lidos de `pricing_analytics` e `call_analytics` da Meta Graph API, com a moeda da conta WhatsApp. O token permanece no servidor. A consulta usa o número como filtro e descarta novamente qualquer outro número retornado pela mesma WABA, para não incorporar custos de suporte ou integrações fora destas conexões.

É um relatório de custos informados pela API, sujeito a revisões, e não uma fatura ou confirmação de pagamento. A seção de WhatsApp não inclui investimento em anúncios, impostos, câmbio ou taxas de terceiros. Não converte USD para BRL nem soma moedas diferentes. Frações de centavo são preservadas para não ocultar pequenas cobranças de ligação. A fatura deve ser conferida no gerenciador da Meta.

Datas são interpretadas no horário de Brasília. O período pode abranger até um ano, conforme disponibilidade/retenção da Meta. Consultas repetidas podem reutilizar cache de cinco minutos. O dia atual pode estar incompleto; valores anteriores também podem ser atualizados pela Meta. Não é um livro financeiro imutável ou backup externo das cobranças.

Erros de token, acesso a custos ou disponibilidade aparecem como consulta parcial/indisponível. Ausência de custo não vira cobrança zero; apenas consultas completas entram nos totais. Quando não há movimento retornado, o relatório informa isso. Operadores e visualizadores não têm acesso a essa consulta financeira.

Conferência real em 11/11/2026: as duas conexões responderam às consultas de moeda/custos e informaram USD. Nenhuma cobrança, assinatura, configuração da Meta ou mensagem foi criada durante a verificação.

Referências: [SDK oficial Meta — pricing analytics e call analytics](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/whatsappbusinessaccount.py), [Documentação de analytics da Meta](https://developers.facebook.com/documentation/business-messaging/whatsapp/analytics).

## Anúncios e custo por lead

O administrador conecta uma conta de anúncios da empresa no próprio dashboard, com ID act_ e token com ads_read/acesso ao ativo. O token pode ser diferente do WhatsApp; é cifrado em AES-GCM no servidor, nunca retornado pela API nem salvo no navegador. Desconectar remove a credencial dedicada. A mesma conta não pode ser vinculada a duas empresas. As rotas são exclusivas de administradores e verificam empresa e conexão.

Consulta somente GET na Marketing API: investimento, impressões, cliques, conversas iniciadas e leads por anúncio/campanha/dia, seguindo a paginação por cursor em domínio fixo, com limite explícito e aviso de parcialidade. Não cria anúncios nem altera orçamento. APIs e interface não tratam erro de permissão, moeda, gasto ausente ou token inválido como custo zero. Cache e atualização automática de até cinco minutos.

Custo por conversa = investimento / conversas iniciadas informadas pela Meta. CPL estimado local = investimento das campanhas elegíveis / contatos com clique atribuído identificado nessas campanhas e nas conexões selecionadas, na data do clique mais recente e fuso da conta de anúncios. O total da conta inteira é mostrado separadamente e não entra no numerador do CPL comercial. O recorte de investimento por conexão usa a classificação explícita das campanhas. Destinos não WhatsApp e números externos ou não conferidos não entram no CPL local. Lacunas de identificação ainda afetam a média. Leads Meta e conversas são métricas diferentes e não são somados. Qualificados/ganhos refletem a situação atual dos contatos, sem atribuir data de conversão. Contatos sem anúncio correspondente aparecem separadamente. Não há custo individual real por lead nem rateio de mensagens por pessoa.

O dashboard mantém anúncios e WhatsApp separados: anúncios usam fuso/moeda da conta de anúncios; mensagens usam Brasília/moeda da WABA. Não soma moedas diferentes nem oferece ROAS sem receita conciliada. Além dos impostos/câmbio/taxas, não inclui custos de IA, infraestrutura ou assinatura nesta versão.

Conferência de acesso em 13/11/2026: ambos os tokens WhatsApp atuais não têm ads_read. Assim, a seção de anúncios depende da configuração pelo administrador, sem números fictícios ou vinculação presumida de contas.

Fonte: [Ads Insights — SDK oficial Meta](https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/adsinsights.py).

## Conta compartilhada entre marcas e finalidades

Uma conta pode reunir marcas/conexões da mesma empresa cadastrada. A classificação é salva por ID de campanha, conexão, finalidade (comercial, recrutamento, outra ou desconhecida), tipo de destino, telefone e confirmação do telefone. Não é criado vínculo por semelhança de nome. Campanhas novas ficam sem classificação até revisão. A mesma conta continua restrita a uma empresa cadastrada; compartilhar conta não compartilha dados entre clientes da plataforma.

O total da conta, o gasto de recrutamento, o não classificado e o valor fora do recorte são exibidos separadamente. O investimento comercial, gráfico diário, contatos, qualificados e ganhos usam somente campanhas comerciais classificadas nas conexões selecionadas. O custo por conversa Meta usa apenas campanhas de WhatsApp. O CPL local usa somente o subconjunto com número real conferido e igual ao número da conexão; o painel informa o gasto e a quantidade de contatos usados nessa base. Ausência de destino confirmado ou de contatos atribuídos deixa o CPL indisponível, sem dividir o orçamento total pelos poucos leads do sistema.

Campanhas com nomes explícitos de recrutamento não podem ser classificadas como comerciais. Site, vídeo, formulários e outros objetivos ficam separados do CPL WhatsApp. Campanhas de WhatsApp da Página exigem conferência do número real; nome de campanha/conjunto ou texto do anúncio não comprova o destino. Números de outras operações não devem ser cadastrados como se pertencessem a uma conexão desta ferramenta. A integração não altera orçamento, campanha, criativo nem telefone na Meta.

A confirmação do número inclui a data a partir da qual ele era o destino real. Confirmações novas assumem o dia atual se a data não foi informada. Gasto e contatos usados no CPL são recortados por essa vigência, no fuso da conta de anúncios; o investimento histórico e o custo por conversa Meta continuam disponíveis separadamente. Confirmar o número atual de uma Página não comprova que ele era o destino em meses anteriores. Não é feita alteração retroativa de destino ou de campanha na Meta.

## Custo por conversa qualificada e comparação

O dashboard apresenta investimento elegível, conversas qualificadas, custo por qualificada e taxa de qualificação. Os detalhes dos anúncios e os custos de WhatsApp ficam em seções expansíveis. O gráfico explica CPL (custo por lead), mostra o cálculo com a base consultada e distingue o custo por qualificada. Os valores são médias observadas de atribuição, sujeitos às lacunas de identificação; não são custos faturados individualmente por pessoa.

Para comparar campanhas, a janela comum começa na maior data entre o início solicitado e as vigências de destino dos anúncios elegíveis selecionados. Gasto e contatos usam essa mesma janela. O detalhamento conserva o CPL por anúncio conforme sua própria vigência; por isso pode diferir da base comum do ranking. O investimento histórico da conta continua disponível nos detalhes.

Custo por qualificada = gasto elegível na janela comum / contatos atribuídos com salesQualification=qualified. Taxa = qualificados / contatos atribuídos. Cada contato é contado por conexão, no dia da origem de anúncio mais recente registrada; não são contadas mensagens nem sessões distintas do mesmo contato. A classificação é o estado atual, confirmado pelo operador ou após cadastro/vínculo verificado no CRM externo, e não reconstitui a data da qualificação. Temperatura morna/quente sozinha não qualifica. Resultado do CRM interno é independente.

O ranking agrupa anúncios da mesma campanha e conexão. Sem gasto ou denominador não há custo calculado. Campanhas sem contatos ou qualificações ficam identificadas; amostras abaixo de cinco qualificados são preliminares. O destaque de menor custo exige consulta completa e pelo menos cinco qualificados na campanha. Esse mínimo é uma regra operacional, não um teste estatístico nem garantia de rentabilidade. Não é calculado ROI sem receita conciliada. Consultas parciais não escolhem uma vencedora.
