# Páginas comerciais restantes — briefing para a IA do sistema

Atualizado em 24/11/2026. Solicitação do responsável: criar as páginas dentro do sistema de origem, com o padrão visual das páginas oficiais Command e botões que levem ao cadastro e ao produto correto.

## 1. Manter as páginas oficiais existentes

| Página | Endereço | Usar quando |
|---|---|---|
| NF-e de produtos | https://commandweb.net/nota-fiscal-eletronica | Empresa que precisa emitir notas de produtos. |
| NFS-e de serviços | https://commandweb.net/nota-fiscal-de-servico | Prestador que precisa emitir notas dos próprios serviços. |
| Oferta para contadores | https://commandweb.net/contador | Contador ou escritório que atende várias empresas. Oferecer também conversa consultiva. |
| Oficina mecânica | https://commandweb.net/oficina | Oficinas mecânicas e serviços automotivos. Página aprovada em 24/11/2026, já vinculada ao catálogo e à IA. Não recriar. |
| Contabilidades | https://commandweb.net/contabilidades | Manter o endereço informado pelo responsável. Confirmar no aplicativo renderizado seu público e fluxo antes de tratá-lo como alternativa à oferta acima. O HTML inicial respondeu como aplicação ERP, sem descrição comercial verificável. Não reutilizar o preço do anúncio antigo. |

As páginas NF-e, NFS-e, contadores e oficina foram consultadas e responderam HTTP 200. Não recriá-las. A página NFS-e é a referência visual principal. Cadastro gratuito não significa emissão gratuita.

Destinos de cadastro encontrados na configuração pública das páginas oficiais:

- NF-e: https://commandweb.net/r/a4ade44e-3ef6-4b7f-ac47-03188de5fa96/cadastro/nota-fiscal-eletronica
- NFS-e: https://commandweb.net/r/a4ade44e-3ef6-4b7f-ac47-03188de5fa96/cadastro/nota-fiscal-de-servico
- Contadores: https://commandweb.net/r/a4ade44e-3ef6-4b7f-ac47-03188de5fa96/cadastro/contador
- Oficina: https://commandweb.net/r/a4ade44e-3ef6-4b7f-ac47-03188de5fa96/cadastro/oficina — o botão é “Assinar e começar”; não anunciar cadastro ou teste gratuito sem confirmação.

Preservar a identificação da revenda. Não substituir por uma conta ou revenda diferente. Os endereços foram identificados sem criar contas ou executar emissão.

## 2. O que existia no comercial e o que precisa ser feito

Foram implementadas apresentações locais em `/conhecer/{conexao}/{produto}` para 16 identificadores: `nfe`, `nfse`, `nfce`, `pdv`, `estoque`, `financeiro`, `erp`, `oficina`, `contador`, `cte`, `mdfe`, `frotas`, `chat`, `crm`, `helena` e `solucoes`.

O responsável rejeitou o padrão visual dessas apresentações e pediu páginas nativas melhores, com acesso direto ao sistema. Não usar essas apresentações como referência de qualidade ou substituto das páginas oficiais. NF-e, NFS-e, contadores e oficina devem usar as páginas oficiais já existentes. As demais devem ser criadas ou avaliadas conforme a matriz abaixo.

As rotas sugeridas são propostas, não endereços já publicados. Verificar primeiro se o sistema já tem uma página equivalente e reaproveitá-la.

## 3. Páginas Command que faltam

| Prioridade | ID comercial | Página/rota sugerida | Problema do cliente e conteúdo obrigatório | Tela real e primeira ação após cadastro |
|---|---|---|---|---|
| Alta | `pdv` | Frente de caixa — `/frente-de-caixa` | Venda lenta e dificuldade de conferir pagamentos e fechamento. Mostrar operação do caixa, venda, formas de pagamento e integração com estoque. Explicar requisitos de impressão, fiscal e TEF sem prometer compatibilidade geral. | Tela real do PDV e conferência do caixa. Abrir a rotina e conhecer uma venda em ambiente adequado. |
| Alta | `nfce` | Cupom fiscal — `/cupom-fiscal` | Varejista que precisa vender e emitir NFC-e. Mostrar venda, conferência, autorização e comprovante. Explicar configuração fiscal e equipamentos exigidos. Não confundir NFC-e com NF-e. | Venda e emissão de NFC-e. Cadastro e configuração orientada; não emitir documento real como demonstração automática. |
| Alta | `estoque` | Controle de estoque — `/controle-de-estoque` | Falta de clareza sobre saldos, entradas, saídas e inventário. Mostrar cadastro, movimentações, locais, conferência e relatórios realmente disponíveis. | Saldo e movimentação de produto. Cadastrar um produto e conhecer a consulta do estoque. |
| Alta | `financeiro` | Gestão financeira — `/gestao-financeira` | Contas esquecidas e dificuldade de acompanhar vencimentos e recebimentos. Mostrar pagar, receber, baixas e consultas. Separar controle financeiro de integração bancária e conciliação de cartões. | Contas a pagar/receber e relatório real. Conhecer um lançamento sem gerar cobrança ou pagamento real. |
| Alta | `erp` | Gestão de loja — `/gestao-de-loja` | Vendas, estoque e financeiro dispersos. Mostrar como as áreas se conectam e permitir escolher a necessidade principal. Explicar quais módulos pertencem ao plano apresentado. | Vendas, estoque e financeiro reais. Onboarding com escolha do foco e primeira rotina. |
| Média | `cte` | Emissão de CT-e — `/conhecimento-de-transporte` | Transportador que precisa organizar a emissão e consultar documentos. Mostrar fluxo real, pré-requisitos fiscais e documentos. Não prometer que todo tipo de transporte está atendido. | CT-e real com dados fictícios autorizados. Cadastro e preparação da configuração, sem emitir documento automaticamente. |
| Média | `mdfe` | Emissão de MDF-e — `/manifesto-eletronico` | Preparar viagem e documentos de transporte. Mostrar veículo, condutor, documentos vinculados e operações de acompanhamento/encerramento disponíveis. | Tela de manifesto e preparação da viagem. Conferir requisitos e iniciar o fluxo demonstrativo. |

As páginas de PDV, estoque, financeiro e ERP são as primeiras a entregar. A página de oficina já foi entregue e aprovada; usar https://commandweb.net/oficina. A prioridade pode ser ajustada pelo volume de leads com cada etiqueta no comercial, sem inventar números.

## 4. Produtos Cilos: avaliar páginas existentes e completar o acesso

Esses produtos pertencem a outra família. Não usar telas, preços, identidade ou vídeos Command para representá-los. A IA que mantém apenas o Command deve entregar esta seção como pendência para os projetos Cilos, sem criar páginas que aparentem habilitar produtos ausentes.

| ID | Página/necessidade | Situação conhecida | O que falta validar ou construir |
|---|---|---|---|
| `frotas` | Controle de veículos, gastos e manutenção | https://frotas.cilos.com.br/ já está no catálogo | Avaliar qualidade da página e cadastro direto. Usar telas reais de frota; conferir condições atuais do teste. |
| `chat` | Organizar atendimento e equipe | https://chat.cilos.com.br/login consta no catálogo e a base registra criação de conta | Página de vendas própria, com caixa de atendimento e organização da equipe; botão direto de nova conta, preservando a origem do lead. Não prometer canais que exijam configuração externa como já conectados. |
| `crm` | Acompanhar oportunidades e próximos passos | https://crm.cilos.com.br/login é acesso informado, não comprovação de cadastro público | Página comercial com funil e oportunidade; confirmar/criar cadastro de nova empresa e condições reais do teste. |
| `helena` | Atendimento inicial com IA e continuidade humana | Liberação pela equipe; sem cadastro público confirmado | Página com recursos realmente disponíveis, telas próprias, demonstração e caminho verdadeiro de ativação. Enquanto não houver autosserviço, ação clara de solicitar acesso. |
| `solucoes` | Encontrar o produto Cilos adequado | Hub precisa ser avaliado/criado | Página de seleção por problema, levando a cada produto. Não anunciar todos os produtos como um único pacote. |

## 5. Padrão obrigatório de cada página

1. **Primeira dobra:** segmento explícito, problema concreto, benefício principal, tela real relevante e dois botões visíveis: ação direta de cadastro/acesso e “Ver como funciona”. Exemplo para oficina: organizar OS, peças e histórico do veículo; evitar apenas “Conheça nossa solução”.
2. **Problemas e solução:** três a cinco situações da rotina do setor, ligadas a recursos comprovados. Cada bloco deve explicar o que o cliente resolve e mostrar a tela correspondente.
3. **Demonstração:** vídeo pertinente e prévias reais do sistema; legenda explicando a tarefa. Um vídeo principal e, se útil, poucos vídeos específicos. Não mostrar uma lista genérica de todo o catálogo.
4. **Como começar:** cadastro, configuração necessária e primeira tarefa útil. Identificar quando é necessário certificado, credenciamento, equipamento ou ajuda da equipe.
5. **Oferta e condições:** apresentar planos ou cobrança somente com dados oficiais atuais do sistema, sem copiar preços de prints antigos. Distinguir cadastro grátis, teste, emissão avulsa, assinatura e adicionais.
6. **Dúvidas frequentes:** responder dúvidas específicas do segmento, funcionamento no navegador, requisitos e apoio humano, com fatos confirmados.
7. **Fechamento da página:** repetir o benefício e o botão direto. Mostrar “Entrar” para clientes existentes e contato humano como apoio. Não obrigar agendamento para experimentar uma oferta de entrada.

Visual: seguir a linguagem da página oficial NFS-e — hierarquia forte, azul da marca, contraste, espaço bem usado, telas em destaque e leitura fácil no celular. Evitar textos excessivos, cartões repetidos, aparência de documentação e imagens genéricas sem relação com o produto.

Usar capturas reais sem dados de clientes, documentos, credenciais ou dados fiscais sensíveis. Identificar dados fictícios e simulações. Não apresentar um desenho de fluxo como se fosse uma tela real.

Gatilhos permitidos: clareza do benefício, demonstração do funcionamento, facilidade para iniciar e condições transparentes. Depoimentos, números, certificações e resultados somente se houver comprovação e autorização. Não inventar urgência, escassez ou garantias.

## 6. Botões e funcionamento do cadastro

- Ação principal deve abrir cadastro/onboarding do **produto correto**, com a revenda e origem preservadas. “Criar conta grátis” somente quando esse cadastro for realmente gratuito; isso não autoriza anunciar uso ou emissão gratuitos.
- “Ver como funciona” abre a demonstração ou a seção explicativa. Não enviar para um WhatsApp sob o rótulo de teste.
- “Entrar” abre o login correto. Login sozinho não deve ser apresentado a um novo lead como cadastro.
- Quando o produto não possui cadastro público, informar isso e oferecer a ação verdadeira de solicitar acesso. Entregar como pendência técnica habilitar o cadastro, sem criar um botão sem destino.
- Preservar `commercial_ref`, UTMs e identificação da revenda da página até a conta criada. Não colocar nome, telefone ou outros dados pessoais na URL.
- Não criar uma conta genérica sem vincular módulo e contexto inicial. Após cadastro, orientar a primeira tarefa relacionada à necessidade do lead.

## 7. Aulas e conhecimento da IA

Fonte oficial: https://commandweb.net/api/public/aulas. Página pública: https://commandweb.net/aulas.

A consulta de 23/11/2026 retornou 119 vídeos, com categorias, títulos, descrições e links YouTube. Usar a categoria e a necessidade do cliente para escolher os vídeos. Descrições não são transcrições e não comprovam que alguém assistiu ou testou todas as funcionalidades.

Atualizar diariamente sem duplicar vídeos, preservando material manual e a última versão válida se a fonte falhar. Não misturar aulas Command nos produtos Cilos. Não gerar preços ou promessas a partir de inferências sobre o vídeo.

Para cada página entregue, devolver ao comercial:

```json
{
  "productId": "oficina",
  "audience": "Oficinas e serviços automotivos",
  "salesUrl": "URL pública efetivamente publicada",
  "signupUrl": "URL verdadeira de cadastro, ou null",
  "loginUrl": "URL verdadeira de acesso",
  "signupFree": false,
  "trialConfirmed": false,
  "conditions": "Condições oficiais verificadas; não preencher por suposição",
  "firstStep": "Primeira tarefa orientada no produto",
  "problemsSolved": ["Problemas que os recursos disponíveis ajudam a resolver"],
  "prerequisites": ["Requisitos reais"],
  "videoIds": ["IDs de aulas oficiais pertinentes"],
  "verifiedAt": "Data da verificação"
}
```

Os valores booleanos do exemplo são conservadores e precisam ser preenchidos segundo a realidade do produto. Publicar uma página não habilita automaticamente cadastro, teste ou módulo.

## 8. Estratégia que a IA comercial deve seguir

- Plano de entrada/necessidade simples: responder à dúvida, enviar a página certa, mostrar um vídeo pertinente e orientar cadastro e primeira tarefa. Não colocar reunião como requisito.
- Contador identificado: compartilhar a oferta de contadores e propor conversa consultiva sobre a operação. Agendar só depois do aceite; se quiser explorar sozinho, permitir.
- Operação mais complexa: avaliar necessidades declaradas como várias empresas, módulos, migração, integração e implantação; oferecer vendedor quando útil. Não adivinhar ticket ou obrigar reunião por uma dúvida técnica isolada.
- Cliente disponível agora, pedindo humano ou querendo contratar: priorizar a transferência, sem exigir vídeo, teste ou agenda futura.
- Não repetir links e perguntas. Acompanhar pela cadência autorizada, respeitando recusa, janela do canal e atendimento humano.

## 9. Cadastro e uso: preparação para Analytics

A integração final com Analytics ainda depende das informações que o responsável vai fornecer. Preparar a atribuição desde já, sem afirmar que o acompanhamento está concluído.

O comercial já possui receptor de eventos por produto: `POST /product-events/{conexao}/{produto}`. Segredo próprio por conexão/produto, somente no servidor. Headers `x-commercial-timestamp` e `x-commercial-signature`; assinatura HMAC SHA-256 de `timestamp + '.' + corpo JSON bruto`, prefixada por `sha256=`. Consultar a implementação existente antes de integrar, sem criar um formato incompatível ou expor segredos no navegador.

Eventos suportados: `signup_completed`, `trial_started`, `first_login`, `activation_completed`, `session_started`, `usage_error`, `subscription_started`, `trial_expired`, `subscription_cancelled`. O corpo usa `eventId`, `accountId`, `kind`, `occurredAt`, `ref` e, quando aplicável, `trialEndsAt`. Usar IDs idempotentes e datas reais. Um cadastro pode associar a conta ao lead pelo `commercial_ref`; não associar contas por aproximação ou por dados de outra empresa.

Cliques e visitas ficam separados de cadastro, ativação e uso. “Testou e saiu” exige critério de inatividade e eventos reais; não pode ser concluído por uma simples abertura de página. Definir ativação útil por produto. Nunca emitir notas, cobranças ou mensagens reais para testar a integração.

## 10. Critérios de aceite e retorno esperado

- Página pública publicada, funcionando em celular e computador, com imagens reais e conteúdo do segmento.
- Todos os botões conferidos e cadastro abrindo o produto correto; sem link vazio, fluxo genérico ou WhatsApp disfarçado de teste.
- Preservação de revenda, UTMs e `commercial_ref` durante o fluxo.
- Conteúdo, preços e condições validados na fonte oficial; proteção de dados nas imagens.
- Vídeo e FAQ específicos do produto; acesso humano disponível.
- Entregar matriz de URLs e metadados da seção 7, capturas das páginas e pendências reais de cadastro/integração.
- Atualizar o catálogo e conhecimento comercial somente depois de os links estarem publicados e conferidos. Manter Command e Cilos separados.

**Pedido à IA responsável pelo sistema:** use este briefing para verificar o que já existe, criar as páginas restantes no padrão oficial e conectar os botões aos fluxos nativos de cadastro e uso. Não recrie as páginas oficiais aprovadas. Entregue primeiro as páginas de maior demanda e a matriz dos links para integração com o comercial.
