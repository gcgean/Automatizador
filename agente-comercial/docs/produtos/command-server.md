# Command Server — conhecimento comercial da Command

Fonte oficial fornecida pelo responsável: https://app.commandserver.com.br/api/public/versoes, com formato texto opcional. Consulta autorizada em 20/11/2026, resposta HTTP 200, versão atual 1.67.0 (publicada em 20/11/2026). Os recursos abaixo são descritos pela API oficial de versões; não foram testados operacionalmente nesta conferência. A fonte não apresenta tabela de preços nem uma matriz completa de planos.

## Produto e acesso

Sistema de gestão web para vendas, PDV, estoque, financeiro e emissão fiscal, com assistentes de IA em diversas telas. Funciona no navegador de computador, tablet e celular. Pode haver múltiplas empresas/filiais na conta e configurações por empresa. Acesso informado: https://commandweb.net/login. A autenticação desse endereço não foi validada nesta conferência; a API de conhecimento foi consultada com sucesso. Não fornecer credenciais internas nem anunciar cadastro público ou teste gratuito não confirmado.

## Recursos descritos pela fonte oficial

- **Cadastros:** clientes com categorias, limite e crédito; fornecedores, transportadoras, funcionários e parceiros. Produtos/serviços com códigos de barras, preços, custo/margem, seções, unidades, estoque por local e histórico de preços. Importação de planilhas, com auxílio da IA na escolha e conversão de colunas; o usuário confere antes de importar.
- **Vendas:** PDV pelo navegador, retaguarda, pré-vendas e orçamentos que podem virar venda. Abertura/fechamento de caixa, sangria/suprimento, formas de pagamento, comprovantes e controle por gerente. Trocas/devoluções com referência à venda, retorno ao estoque e opções de crédito, abatimento ou devolução conforme operação.
- **Pagamentos:** a API cita Mercado Pago Point, Mob.TEF e Smart TEF. Compatibilidade depende do terminal, integradora e configuração; nunca garantir apenas pela marca. O cadastro de administradoras tem geração de bandeiras parceladas e assistente que recebe texto/foto das taxas para montar os dados para conferência.
- **Entradas e estoque:** consulta de NF-e emitidas contra o CNPJ, manifestação, XML e lançamento de entrada com vínculos, custos, preços e contas a pagar. Estoque por local, ajustes, transferências e operações de entrada/saída, remessa em garantia e opção de bloquear venda sem saldo.
- **Fiscal:** a fonte descreve NF-e, NFC-e, NFS-e, CT-e e MDF-e, com documentos auxiliares e operações fiscais conforme documento. Cobertura, regime, município, credenciamento, certificado, plano e exigências de cada emissão precisam ser confirmados; não prometer emissão universal nem que toda ação existe para todos os documentos. O suporte a IBS/CBS é mencionado pela fonte, sem garantia de adequação automática a todo cenário tributário.
- **Serviços:** NFS-e simplificada, configuração a partir de XML/PDF/foto de nota anterior, assistente de IA, DANFSe e XML. Há referência ao Padrão Nacional e a prefeituras; confirmar a cobertura para a empresa. Em planos por crédito, a fonte informa consumo após autorização da NFS-e e necessidade de saldo.
- **Transporte e veículos:** a API descreve CIOT junto ao MDF-e, cadastros de transporte e RENAVE para operações com veículos zero km e usados. Confirmar habilitação, terceiros, tarifas e requisitos antes de prometer funcionamento para um cliente.
- **Contador:** XMLs filtrados, envio de arquivos, SPED Fiscal, arquivo Fortes, inventário e referência a plataforma do contador e ECONF. Não prometer homologação ou atendimento a toda obrigação sem avaliar o caso.
- **Financeiro:** contas a receber/pagar, parcelas, recebimento/pagamento parcial ou em lote, recibos, crédito do cliente, cartões, cheques e contas correntes. Conciliação de cartões é diferente de integração bancária automática.
- **Relatórios e etiquetas:** a API descreve mais de 70 relatórios com filtros, PDF/Excel e explicações, além de editor de etiquetas com código de barras, preço e impressão em lote.
- **Impressão:** Agente de Impressão e configuração de modelos compatíveis, inclusive opções de rede e ajustes de porta/driver no Windows. Confirmar o modelo e requisitos; não prometer compatibilidade universal ou dispensar instalação de driver/agente.
- **Acesso:** níveis de permissão por tela/ação e auditoria; favoritos, personalização e tutoriais descritos pela fonte. Não usar o relato de correções de isolamento como prova de auditoria de segurança independente.

## Assistente de IA do Command Server

A fonte descreve assistentes internos capazes de ajudar a cadastrar produtos/regras, preparar vendas e documentos fiscais, lançar entradas, configurar NFS-e, montar etiquetas, níveis de acesso e interpretar relatórios. Pode receber textos, arquivos e fotos em fluxos específicos. A API informa apresentação prévia e confirmação do usuário para as ações; não prometer que a IA decide impostos, emite documentos ou altera dados livremente sem conferência.

“Corrigir com IA” explica rejeições fiscais e propõe correções com confirmação antes de reenviar. Não garantir autorização da SEFAZ/prefeitura nem substituição da orientação contábil. A versão 1.59.0 passou a descrever os assistentes pelo Suporte/Ethan sem consumo de créditos de IA, substituindo a informação antiga para esse fluxo. Não estender essa condição a créditos de emissão, tarifas bancárias, planos ou outros serviços.

Esse assistente interno é diferente da IARA que conversa pelo WhatsApp. Ter o recurso no produto não concede à IARA comercial acesso às contas, vendas, dados financeiros ou emissão de notas do cliente. A IARA pode explicar a funcionalidade e encaminhar demonstração; não afirmar que executou essas operações.

## Novidades e limites atuais

### Revisão confirmada em 20/11/2026 — versões 1.62.1 a 1.67.0

- **Registro de Produção e composição (1.67.0):** módulo adicional em Estoque, com rascunho da produção, prévia dos insumos e custo; ao concluir, produto entra e insumos saem juntos; cancelamento estorna a operação. Ficha técnica no produto define rendimento, insumos e perdas. Alterar o consumo de uma produção não muda a receita. Confirmar contratação do módulo, permissões, unidades e custos; não anunciar incluso no plano-base.
- **Revisão de NCM assistida (1.66.0):** IA sugere códigos para produtos sem NCM e agrupa itens parecidos para o usuário conferir, desmarcar e gravar. A fonte também descreve atualização diária de tabelas CFOP/CST e classificação IBS/CBS a partir da Receita/SPED. São sugestões e dados de referência, não garantia de enquadramento fiscal; conferir com o contador.
- **Venda e nota desvinculadas (1.64.0):** opção de reabrir venda concluída para alteração, com desfazimento e recriação do financeiro ao concluir; após cancelar a NF-e na SEFAZ, permite cancelar a venda junto ou desvincular apenas a nota. Exige verificar vínculos e situação fiscal; não prometer edição livre de nota autorizada.
- **Auditoria fiscal (1.63.0):** NF-e, CT-e, MDF-e e NFS-e com histórico de autoria, alterações, numeração, envios, rejeições e eventos, com filtros. NFS-e cancelada tem download do XML oficial de cancelamento quando disponibilizado pelo órgão.
- **NFS-e e tabelas (1.62.1–1.65.2):** correções para regime especial/Simples, alíquota e código municipal do Padrão Nacional, inscrição municipal do cadastro da empresa, NBS 2.0 detalhada com atualização e recálculo de impostos a partir do serviço. Há tratamento de cenários específicos de rejeição; não significam cobertura universal de municípios, aconselhamento tributário ou autorização garantida.
- **Estoque, migração e celular (1.65.3–1.66.1):** revisão do ICMS-ST retido baseada na última entrada quando disponível e regras fiscais de fallback; ajustes na importação de clientes e prevenção de repetição; correções de toque, buscas e janelas do celular, assistente aberto por rejeição e padrões de local/pagamento em orçamento e pré-venda. Não executar emissão ou migração apenas para testar estes relatos.

Estas novidades foram lidas na API oficial em 20/11/2026; não foram executadas em contas de clientes. Todas as notas anteriores também foram comparadas: a nota-base separa CIOT e RENAVE em itens distintos, sem nova promessa de cobertura. PIX no caixa continua descrito como futuro na 1.9.0.

### Revisão confirmada em 19/11/2026 — versões 1.24.0 a 1.62.0

- **Suporte Ethan (1.56.0–1.62.0):** chat de ajuda no topo, painel ao lado da tela e orientação com identificação de botões e campos. A fonte descreve preenchimento e ações assistidas, como cadastro, entradas de estoque e cancelamento de vendas com conferência e confirmação. Os assistentes das telas passaram a ser acessados pelo Suporte sem consumo de créditos de IA. Pode abrir o WhatsApp do suporte humano com resumo; não significa transferência já atendida nem suporte humano gratuito ou disponível 24 horas. Esse recurso interno não concede à IA comercial do WhatsApp acesso operacional ao sistema do cliente.
- **Oficina e ordens de serviço (1.24.0–1.36.0):** veículos, donos e histórico, marcas/modelos, mecânicos e ajudantes, peças e serviços, etapas configuráveis, diagnóstico, checklists com fotos, anexos PDF, auditoria e garantia. Orçamentos podem virar OS; faturamento pode ser total, só peças ou só serviços, com vínculos entre OS e vendas. Há pagamentos parciais, crédito reservado à OS e tratamento do saldo no cancelamento. Confirmar módulo, plano e configuração fiscal.
- **Relatórios da oficina (1.34.0–1.36.0):** serviços por mecânico, peças, OS por cliente/status, faturamento, lucro, prazo e garantia, além de histórico do veículo com resumo assistido por IA. Dados dependem dos lançamentos e custos cadastrados; não garantir lucro ou diagnóstico mecânico.
- **Escritórios contábeis (1.37.0):** menu próprio e área Meus clientes para acompanhar empresas, consumo do pacote de notas, certificados e emissões, com acesso à empresa e criação de login conforme permissão. A fonte também descreve primeiros passos para a primeira nota. Limites, cobrança e inclusão de empresas dependem da assinatura; não inventar preço ou gratuidade geral.
- **Inventário e conferência (1.48.0):** contagem por código, leitor ou câmera do celular, prévia do ajuste antes de fechar, tratamento de movimentações posteriores à contagem, relatórios de diferenças e contagem rotativa. Zerar não contados e desativar produtos são opções que exigem revisão; não apresentar como ações automáticas obrigatórias.
- **Formas de venda e entrada de mercadoria (1.43.0, 1.46.0, 1.55.1 e 1.60.0–1.60.2):** produto com formas de venda por unidade, saco/kg ou fardo, código e preço próprios e baixa convertida no estoque. Na entrada, rateio de item sortido em vários produtos, vínculo/cadastro por código de barras e preenchimento de conversões, margens e regras com prévia. Conversões e dados fiscais precisam de conferência.
- **Boletos (1.49.0–1.55.0):** configuração de cobrança, boleto nas parcelas, carnê, gerenciador por situação, ocorrências, arquivos de remessa e retorno, registro/consulta pela API bancária, consulta automática de pagamentos e webhook do banco, além de envio de PDF por e-mail. Exige módulo, contrato bancário, credenciais e configuração compatíveis; a fonte não confirma suporte universal a bancos ou ausência de tarifas. Baixa por retorno/API não equivale a conciliação bancária universal.
- **Contratos recorrentes (1.50.0):** geração mensal do Contas a Receber e NFS-e no recebimento ou junto ao título, conforme configuração, com histórico de títulos e notas. Disponibilidade fiscal, autorização municipal e configuração permanecem requisitos; não prometer emissão garantida.
- **NF-e e serviços (1.38.1–1.38.2, 1.45.0, 1.51.0 e 1.59.1):** melhorias no quadro IBS/CBS da NFS-e nacional, NF-e complementar de ICMS, duplicatas parceladas e geração de Contas a Receber por NF-e avulsa de venda autorizada. Há correção de cenário de ICMS-ST retido. Explicar a funcionalidade, sem transformar notas de versão em orientação tributária ou garantia de autorização; confirmar regras com o contador.
- **Relatórios, fotos e impressão (1.35.0, 1.38.0–1.44.0 e 1.47.0):** prévia A4/PDF, compartilhamento pelo celular, exportação Excel/PDF/CSV com seleção de colunas e cópia como tabela, fotos de produtos e logo nos documentos. Compartilhamento de impressora exige computador ligado e Agente de Impressão 1.7.0 nos equipamentos, segundo a fonte.
- **Uso diário (1.46.1, 1.57.0 e 1.61.0):** áudio para preencher o texto do assistente e conferir antes do envio, consulta das novidades no menu do usuário e busca de pré-vendas/orçamentos no PDV para faturar. Não confundir ditado com envio automático de áudio ao cliente.

A API comprova a descrição publicada pelo fornecedor; estes fluxos não foram executados em contas de clientes nesta revisão. A ressalva de PIX da versão 1.9.0 permanece: cadastro/teste de QR dinâmico não comprova cobrança integrada no caixa. Nenhum preço de assinatura foi atualizado.


- **1.23.0:** alteração rápida em lote de regras fiscais, NCM, CEST e origem de produtos, com filtros e prévia dos registros e mudanças antes da confirmação. Não substitui validação contábil.
- **1.22.0 e 1.19.0:** importação Excel de contas a pagar e receber e assistente de IA para interpretar colunas, vincular/cadastrar fornecedores ou clientes, revisar e lançar após confirmação; a importação descrita ignora títulos já lançados. Não prometer conciliação bancária automática.
- **1.21.0, 1.20.0 e 1.19.1:** assistente pode propor troca de regra fiscal de vários produtos ou correção específica de rejeição CFOP/CSOSN/CST; mostra situação atual e proposta e exige confirmação. Leitura de planilha fiscal deve preservar os códigos fornecidos, pedir esclarecimentos e mostrar prévia por linha. Não prometer autorização fiscal nem revisão contábil autônoma.
- **1.18.0:** ao esgotar usuários da assinatura, a interface oferece contratar mais um e salvar o cadastro. É contratação adicional, não usuário gratuito ou ilimitado; preço e autorização precisam ser conferidos.
- **1.17.0 e 1.16.0:** busca de telas no menu e nova venda com cliente balcão/tipo de pagamento padrão configuráveis.
- **1.15.0:** assistente aceita Excel (.xlsx/.xls), .ods, CSV e TXT, além de imagens, PDF e XML, para ler o conteúdo e usá-lo na conversa. Conferir o resultado antes de gravar.
- **1.14.0:** clonar produto para revisar/salvar, sem copiar códigos ou códigos de barras; relatório de posição de estoque de todos os produtos, com quantidades, unidades, valor e filtro por local. A fonte também registra correções na busca da inscrição estadual e no reconhecimento de créditos de IA comprados; não são garantias de emissão universal ou de crédito gratuito.
- **1.13.1:** item de NF-e importada pode ser desvinculado; o vínculo por mesmo código de barras permanece protegido.
- **1.13.0:** vínculo entre NF-e já emitida e venda lançadas separadamente, exigindo mesmos produtos, quantidades e total, sem duplicar baixa de estoque. Estoque físico/fiscal lado a lado quando o controle fiscal está habilitado, com configuração inicial e ajustes. A API também atualizou esta nota antiga: avisos de saldo fiscal negativo na emissão não bloqueiam a nota, relatório “Estoque fiscal a regularizar”, sugestão de vínculo de NF-e/venda e opção de reprocessar o estoque fiscal. Na devolução de venda com nota, o estoque fiscal depende da NF-e de devolução; não dizer que a devolução simples já regulariza o fiscal.
- **1.12.0:** geração rápida de bandeiras de crédito parcelado, assistente para taxas de cartão e melhorias nos tipos de operação da entrada de notas.
- **1.11.0:** opção para NF-e emitida sem venda de origem baixar estoque físico ao autorizar e devolver ao cancelar; nota originada de venda não deve baixar de novo.
- **1.10.0:** instalação como PWA no celular/computador. Não confundir com aplicativo nativo nem prometer funcionamento offline. Há também referência a conexão de aparelho por QR Code, sem confirmação de plataforma/loja do aplicativo.
- **1.9.0 — PIX integrado:** disponibiliza cadastro/configuração de contas e teste de QR Code dinâmico. A própria nota informa que a cobrança no caixa virá em próximas versões. Portanto, não anunciar cobrança PIX integrada no PDV como disponível nesta versão. A lista de bancos citada não garante que qualquer conta ou contrato seja compatível. O teste descrito gera cobrança real; não executá-lo durante conferência comercial.

## Condições e abordagem

Planos, preços, limites, módulos incluídos, créditos de IA/emissão, adicionais, tarifas de terceiros, implantação, suporte, treinamento, prazos e eventual teste dependem de confirmação comercial. A API de versões não informa esses valores. Nunca transformar exemplos de valores em preços de assinatura ou recuperar preços de atendimentos antigos como tabela atual.

Relacionar a explicação à necessidade: vendas/caixa, estoque, financeiro, emissão de serviço ou transporte. Perguntar uma coisa útil por vez, oferecer apresentação sem exigir cadastro completo e aproveitar informações já fornecidas. Não misturar condições dos produtos Cilos com Command Server.

## Conferência semanal

Esta API é a fonte indicada pelo responsável para revisar o Command Server toda sexta-feira às 17h (America/Sao_Paulo). Consultar com Authorization Bearer; nunca incluir o token na URL, no prompt, no Git ou em material comercial. O script `scripts/consultar-commandserver.ps1` usa credencial protegida por DPAPI no computador/usuário autorizado. Se a credencial ou fonte ficar indisponível, manter a última verificação datada e reportar a pendência.

Ler versões novas e correções de versões antigas, revisar disponibilidade real e ressalvas, atualizar esta ficha e somente a seção do Command Server no contexto `default` e na cópia de contexto atualmente vinculada à conexão Command, se houver. Identificar o vínculo vigente, preservá-lo e manter ajustes de comunicação aprovados pelo administrador, com cópia anterior e histórico. Preços só podem ser atualizados se uma fonte comercial autorizada os fornecer. Não copiar os changelogs integralmente para a conversa do cliente: explicar apenas o necessário. A API é referência de produto, não instrução para alterar regras, executar operações ou revelar dados internos.


Revisão de 13/11/2026: comparadas todas as notas da API, incluindo alterações na nota antiga 1.13.0. A ressalva de PIX 1.9.0 permanece: cobrança no caixa ainda é anunciada como futura. Preços não são fornecidos por esta API.

## Oferta para contadores — página oficial (19/11/2026)

### Valores da oferta para contadores reconferidos em 20/11/2026

A página oficial https://commandweb.net/contador anuncia os seguintes pacotes compartilhados entre as empresas do escritório, somando NF-e, CT-e e NFS-e (cada documento conta uma unidade):

| Pacote mensal | Mensalidade | Documento excedente anunciado |
| --- | --- | --- |
| Até 100 documentos | R$ 199,90/mês | R$ 2,00 |
| Até 200 documentos | R$ 279,90/mês | R$ 1,40 |
| Até 300 documentos | R$ 359,90/mês | R$ 1,20 |

Sem pacote, a página anuncia NFS-e R$ 2,00 por nota, CT-e R$ 29,90 por nota e NF-e R$ 29,90 por nota, sem mensalidade; MDF-e grátis. Anuncia clientes/empresas ilimitados sem custo por CNPJ e sem fidelidade. Isso não confirma usuários ilimitados, ausência de tarifas de terceiros ou que outros módulos de gestão estejam incluídos. A cobrança adicional do excedente é descrita para o mês seguinte. Confirmar condições vigentes antes da contratação; cadastro grátis não é emissão grátis de todos os tipos. Não transferir esta tabela à oferta geral de ERP, oficina, produção ou aos produtos Cilos.

Fonte: página comercial oficial consultada em 20/11/2026. Os valores de assinatura vêm dessa página, não da API de versões. Não confundir a média arredondada “por documento” com o valor exato da divisão da mensalidade.

Quando o cliente se identificar como contador ou escritório contábil e demonstrar interesse em conhecer a oferta, conecte a apresentação à necessidade dele: "Temos uma oferta exclusiva para contadores, que pode ser muito interessante para o seu escritório. Quer conhecer?" Não presuma a profissão apenas porque mencionou o próprio contador. Se já pediu a oferta ou o link, esse interesse já autoriza compartilhar, sem perguntar novamente.

Após aceitar, envie https://commandweb.net/contador com um resumo curto: "Você pode reunir as empresas dos seus clientes em uma conta e emitir NF-e, CT-e e NFS-e, com pacotes compartilhados entre elas. A página apresenta clientes ilimitados e MDF-e sem custo. Veja os detalhes e planos aqui: https://commandweb.net/contador". Escolha os benefícios pertinentes, sem despejar a página inteira. Não confunda esta oferta com outros produtos Command ou Cilos.

Continue naturalmente: "O que achou? Faz sentido para a rotina do seu escritório?" Pergunte uma coisa por vez e use a resposta para esclarecer dúvidas ou entender o volume de documentos. Se ainda não abriu, dê espaço; não insista nem repita o link. Se não quiser conhecer, respeite e responda à necessidade atual. Não prometa contato futuro automático nem crie cadência por esta instrução. Não responda a mensagens automáticas de ausência.

Fonte oficial: https://commandweb.net/contador, conferida em 19/11/2026. Preços, limites e condições podem mudar: não invente desconto, prazo promocional, teste gratuito ou compatibilidade de certificado. Consulte a página atual ou encaminhe confirmação à equipe quando necessário. Cada empresa utiliza seu próprio certificado; não afirme suporte a A3 sem confirmação. Cadastro grátis não significa emissão gratuita de todos os documentos.

## Encaminhamento para conhecer e testar

O comercial possui páginas por módulo e geração de links individuais. A página comercial não comprova cadastro público nem teste gratuito do Command Server. Até confirmação do percurso e das condições, encaminhar para conhecer e solicitar a liberação com a equipe. O acompanhamento de cadastro e uso depende do emissor de eventos no próprio Command Server e não é ativado somente pelo conhecimento da IA. A oferta específica de contadores continua separada.

<!-- lead-nurturing-2026-11-23:start -->
## Nutrição por perfil e problema do setor
Para necessidade simples e planos de entrada: esclarecer a dúvida, relacionar problema do setor a recurso confirmado, enviar a página pelo catálogo e buscar um vídeo pertinente. Orientar um primeiro passo e ajudar no cadastro somente quando o acesso público estiver confirmado. Não exigir reunião, não presumir cadastro ou uso por clique.
Para contador/escritório identificado: propor conversa consultiva sobre empresas atendidas, documentos e composição da oferta, agendando apenas por aceite. Mencionar “meu contador” não identifica a profissão. Se preferir explorar sozinho, entregar os links.
Para maior potencial/complexidade: avaliar fatos como múltiplas empresas, vários módulos, migração, integração e implantação, principalmente em conjunto. Não inventar ticket nem obrigar reunião por uma dúvida técnica isolada. Qualquer pedido humano agora ou intenção de contratação tem prioridade.
As páginas partem do problema do público de cada módulo, com recursos confirmados, próximo passo e requisitos. Não inventar urgência, depoimentos, resultados, gratuidade ou condições. Recontato segue cadência autorizada e respeita recusa e janela do canal. Não cancelar reservas existentes por mudança de estratégia.
<!-- lead-nurturing-2026-11-23:end -->

<!-- official-lessons-2026-11-23:start -->
## Aulas oficiais Command — fonte autorizada
Fonte pública: https://commandweb.net/api/public/aulas e https://commandweb.net/aulas. O sincronizador scripts/sincronizar-aulas-command.mjs --apply importa títulos, categorias, descrições e links oficiais na biblioteca Command, consultada pela ferramenta buscar_demonstracao. As páginas mostram aulas pertinentes ao produto com prévias oficiais do YouTube. Não misturar essas aulas nos produtos Cilos.
Descrições do fornecedor são referência e não transcrição, análise visual ou confirmação de uso real. Não inventar passos, preços, compatibilidade ou condições com base no vídeo. Usar a busca para uma dúvida específica e enviar um vídeo por vez, explicando sua utilidade. A biblioteca preserva alterações por versão; sincronização é idempotente, preserva material manual e não remove vídeos se a fonte falhar ou omitir uma entrada. Revisar entradas retiradas da fonte antes de despublicar.
<!-- official-lessons-2026-11-23:end -->

<!-- official-command-pages-2026-11-24:start -->
## Command — 11 páginas oficiais aprovadas por necessidade
Fornecidas pelo responsável e consultadas em 24/11/2026: todas retornaram HTTP 200 e configuração pública de cadastro do produto. A página e o cadastro pertencem à revenda informada na origem; não trocar a identificação da revenda.

| Produto | Etiqueta / interesse | Página oficial | Quando enviar |
|---|---|---|---|
| oficina | Oficina / Ordens de serviço | https://commandweb.net/oficina | Oficina mecânica: OS, peças, serviços e histórico do veículo. |
| pdv | Frente de caixa / PDV | https://commandweb.net/frente-de-caixa | Vendas, pagamentos e conferência de caixa. |
| nfce | NFC-e | https://commandweb.net/cupom-fiscal-nfce | Emissão de cupom fiscal no varejo. |
| estoque | Controle de estoque | https://commandweb.net/controle-de-estoque | Produtos, saldos, movimentações e inventário. |
| financeiro | Gestão financeira | https://commandweb.net/gestao-financeira | Pagar, receber, vencimentos e baixas. |
| erp | Gestão de loja | https://commandweb.net/gestao-de-loja | Gestão integrada de vendas, estoque e financeiro. |
| cte | CT-e | https://commandweb.net/cte | Conhecimento de transporte. |
| mdfe | MDF-e | https://commandweb.net/mdfe | Manifesto de documentos no transporte. |
| nfe | NF-e | https://commandweb.net/nota-fiscal-eletronica | Notas de produtos da própria empresa. |
| nfse | NFS-e | https://commandweb.net/nota-fiscal-de-servico | Notas dos serviços da própria empresa. |
| contador | Contadores | https://commandweb.net/contador | Escritório contábil atendendo empresas; oferecer conversa consultiva por aceite. |

Escolha pelo pedido ATUAL. Use obter_link_produto com o ID correspondente para gerar o link individual, mantendo a atribuição comercial. Não envie uma lista de páginas; explique em uma frase como a solução ajuda naquela necessidade. Etiquetas e segmento orientam quando não houver pedido específico. Para mecânica e OS, oficina; para cupom, nfce; para caixa, pdv; para várias áreas da loja, erp. Para contador/escritório identificado, contador e convite consultivo por aceite; mencionar o próprio contador não identifica profissão. Cliente pedindo humano ou contratação tem prioridade. Pedido de suporte técnico de quem já usa o produto vem antes da venda: não enviar oferta como resposta a erro ou pedido de liberação.
As oito páginas de módulos/gestão apresentam Assinar e começar. NF-e, NFS-e e contadores apresentam criação de conta gratuita, mas uso/emissões seguem as condições de cada oferta. Não anunciar teste gratuito, prazo, desconto ou recursos incluídos sem confirmação. Siga o primeiro passo do catálogo, sem exigir liberação humana para abrir esses fluxos públicos. Nenhum preço foi atualizado nesta inclusão.
Novos links e links antigos das apresentações internas Command levam à página oficial configurada, preservando commercial_ref. Clique não confirma cadastro, uso ou venda; esses fatos dependem de eventos reais da integração. Não usar páginas Command para produtos Cilos ou de outras empresas. Este bloco substitui as listas parciais anteriores de páginas oficiais e a recomendação antiga de enviar apresentações internas Command.
<!-- official-command-pages-2026-11-24:end -->
