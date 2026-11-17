# Validação visual do CRM

Conceito: [C:/Users/Pichau/.codex/generated_images/01a1cfb3-db23-78b2-9294-3500a4d8bd56/exec-c20b2e92-97aa-46ae-ab09-e480888db9bc.png](C:/Users/Pichau/.codex/generated_images/01a1cfb3-db23-78b2-9294-3500a4d8bd56/exec-c20b2e92-97aa-46ae-ab09-e480888db9bc.png). Capturas finais: [desktop](../test-results/crm-desktop.png) e [celular](../test-results/crm-mobile.png). Todos os nomes e valores das capturas são fictícios e exclusivos do banco isolado de QA.

Verificado com Playwright, Chromium via canal Microsoft Edge, pois o plugin Browser/IAB não estava disponível nesta sessão. Capturas pelo page.screenshot; conceito e renderização final inspecionados via view_image na mesma rodada. Desktop na resolução nativa do conceito, 1536 × 1024; celular 390 × 844, incluindo diálogo de criação e rolagem interna do funil sem transbordar a página.

| Ponto | Referência e resultado | Ajuste ou diferença intencional |
|---|---|---|
| Estrutura | Cabeçalho, título, quatro indicadores, filtros e quatro colunas na mesma ordem | Cabeçalho e marca atuais preservados para manter Conversas consistente |
| Texto | CRM, subtítulo e Nova oportunidade preservados; busca, responsáveis, conexões e situações conferidos | Configurar funil foi acrescentado para administrar o recurso; dados reais substituem exemplos do conceito |
| Espaçamento | Margens de 28 px, indicadores em uma linha e cartões com respiro | Corrigida precedência do CSS para aplicar margem desktop sem afetar as demais abas |
| Tipografia | Hierarquia de título, valores, cartão e metadados comparada | Aumentada a escala desktop; mantida a família do aplicativo para consistência |
| Paleta e superfícies | Fundo cinza azulado claro, cartões brancos, linhas azuis leves, quatro pontos de etapa coloridos | Sem fotografia ou bitmap no produto; interface implementada em HTML/CSS |
| Ícones | Camadas, usuários, troféu, telefone, calendário e reticências conferidos | Carteira no indicador de valor, em lugar do símbolo monetário do conceito, por usar o conjunto existente |
| Interação e mobile | Formulário, notas, busca, etapas, ganho, abrir conversa e configuração exercitados | Celular usa duas colunas de indicadores e rolagem horizontal do quadro; formulário em uma coluna |

Diferença de texto acima da dobra: apenas controle Configurar funil, seletor Empresa do aplicativo e dados/nomes de QA, todos necessários às funções. Mantidos os rótulos e a sequência da proposta. Não foram introduzidas promessas comerciais nem indicadores fictícios na produção.

A implementação foi verificada fielmente contra o conceito, respeitadas as diferenças intencionais acima. Não restam discrepâncias materiais de layout identificadas. Fluxo principal validado com servidor e PostgreSQL locais reais, transportes externos bloqueados e 102 testes automatizados aprovados; nenhum cliente recebeu mensagem de teste.
