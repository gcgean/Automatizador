// Páginas fornecidas pelo responsável e conferidas em 24/11/2026. Sem atualização de preços.
export const OFFICIAL_COMMAND_PAGES={
  "oficina": {
    "salesUrl": "https://commandweb.net/oficina",
    "trialConfirmed": false,
    "purpose": "Oficina mecânica: ordens de serviço, peças, serviços e histórico de veículos.",
    "conditions": "Contratação e acesso conforme os planos e condições da página oficial. Não anunciar teste gratuito nem cadastro gratuito sem confirmação.",
    "firstStep": "Abra a página oficial, confira as condições e selecione Assinar e começar para seguir o cadastro do produto."
  },
  "pdv": {
    "salesUrl": "https://commandweb.net/frente-de-caixa",
    "trialConfirmed": false,
    "purpose": "Frente de caixa: registrar vendas, pagamentos e conferir abertura/fechamento do caixa.",
    "conditions": "Contratação e acesso conforme os planos e condições da página oficial. Não anunciar teste gratuito nem cadastro gratuito sem confirmação.",
    "firstStep": "Abra a página oficial, confira as condições e selecione Assinar e começar para seguir o cadastro do produto."
  },
  "nfce": {
    "salesUrl": "https://commandweb.net/cupom-fiscal-nfce",
    "trialConfirmed": false,
    "purpose": "Comércio varejista que precisa emitir cupom fiscal NFC-e.",
    "conditions": "Contratação e acesso conforme os planos e condições da página oficial. Não anunciar teste gratuito nem cadastro gratuito sem confirmação.",
    "firstStep": "Abra a página oficial, confira as condições e selecione Assinar e começar para seguir o cadastro do produto."
  },
  "estoque": {
    "salesUrl": "https://commandweb.net/controle-de-estoque",
    "trialConfirmed": false,
    "purpose": "Cadastro, saldos, entradas, saídas, inventário e movimentação de produtos.",
    "conditions": "Contratação e acesso conforme os planos e condições da página oficial. Não anunciar teste gratuito nem cadastro gratuito sem confirmação.",
    "firstStep": "Abra a página oficial, confira as condições e selecione Assinar e começar para seguir o cadastro do produto."
  },
  "financeiro": {
    "salesUrl": "https://commandweb.net/gestao-financeira",
    "trialConfirmed": false,
    "purpose": "Contas a pagar e receber, vencimentos, baixas e controle financeiro.",
    "conditions": "Contratação e acesso conforme os planos e condições da página oficial. Não anunciar teste gratuito nem cadastro gratuito sem confirmação.",
    "firstStep": "Abra a página oficial, confira as condições e selecione Assinar e começar para seguir o cadastro do produto."
  },
  "erp": {
    "salesUrl": "https://commandweb.net/gestao-de-loja",
    "trialConfirmed": false,
    "purpose": "Gestão da loja com vendas, estoque e financeiro na mesma solução.",
    "conditions": "Contratação e acesso conforme os planos e condições da página oficial. Não anunciar teste gratuito nem cadastro gratuito sem confirmação.",
    "firstStep": "Abra a página oficial, confira as condições e selecione Assinar e começar para seguir o cadastro do produto."
  },
  "cte": {
    "salesUrl": "https://commandweb.net/cte",
    "trialConfirmed": false,
    "purpose": "Transportador que precisa emitir conhecimento de transporte CT-e.",
    "conditions": "Contratação e acesso conforme os planos e condições da página oficial. Não anunciar teste gratuito nem cadastro gratuito sem confirmação.",
    "firstStep": "Abra a página oficial, confira as condições e selecione Assinar e começar para seguir o cadastro do produto."
  },
  "mdfe": {
    "salesUrl": "https://commandweb.net/mdfe",
    "trialConfirmed": false,
    "purpose": "Operação de transporte que precisa preparar e acompanhar manifesto MDF-e.",
    "conditions": "Contratação e acesso conforme os planos e condições da página oficial. Não anunciar teste gratuito nem cadastro gratuito sem confirmação.",
    "firstStep": "Abra a página oficial, confira as condições e selecione Assinar e começar para seguir o cadastro do produto."
  },
  "nfe": {
    "salesUrl": "https://commandweb.net/nota-fiscal-eletronica",
    "trialConfirmed": false,
    "purpose": "Empresa que precisa emitir NF-e de produtos.",
    "conditions": "A página oferece criação de conta gratuita. Uso, emissão, pacotes e limites são cobrados conforme as condições atuais da oferta; cadastro gratuito não significa uso ou emissão grátis.",
    "firstStep": "Abra a página oficial, confira as condições e selecione Criar conta grátis para seguir o cadastro do produto."
  },
  "nfse": {
    "salesUrl": "https://commandweb.net/nota-fiscal-de-servico",
    "trialConfirmed": false,
    "purpose": "Prestador que precisa emitir NFS-e dos próprios serviços.",
    "conditions": "A página oferece criação de conta gratuita. Uso, emissão, pacotes e limites são cobrados conforme as condições atuais da oferta; cadastro gratuito não significa uso ou emissão grátis.",
    "firstStep": "Abra a página oficial, confira as condições e selecione Criar conta grátis para seguir o cadastro do produto."
  },
  "contador": {
    "salesUrl": "https://commandweb.net/contador",
    "trialConfirmed": false,
    "purpose": "Contador ou escritório contábil que atende várias empresas; propor conversa consultiva por aceite.",
    "conditions": "A página oferece criação de conta gratuita. Uso, emissão, pacotes e limites são cobrados conforme as condições atuais da oferta; cadastro gratuito não significa uso ou emissão grátis.",
    "firstStep": "Abra a página oficial, confira as condições e selecione Criar conta do escritório para seguir o cadastro do produto."
  }
};
export const COMMAND_LINK_GUIDANCE="\nSELEÇÃO DAS PÁGINAS OFICIAIS COMMAND: escolha pelo pedido ATUAL e use obter_link_produto com o ID pertinente; o campo uso no catálogo explica o destino. Etiquetas e segmento ajudam quando não houver pedido específico. Um link útil com uma explicação curta, sem despejar o catálogo. Para oficina mecânica com necessidade de OS, peças e veículos, use oficina. Para cupom fiscal, nfce; para operar o caixa, pdv; para vários setores da loja, erp; para contas, financeiro; para saldos e movimentações, estoque; para notas de produtos, nfe; para serviços próprios, nfse; para transporte, cte ou mdfe conforme o documento pedido. Contador/escritório identificado: contador e convite consultivo por aceite; mencionar o próprio contador não identifica a profissão. Pedido de suporte técnico tem prioridade: não mandar oferta para quem já usa o sistema e pede correção/liberação. Use os links individuais gerados pela ferramenta, que levam às páginas oficiais. Siga o primeiro passo de cada oferta; cadastro gratuito não significa uso/emissão gratuitos. Um clique não confirma cadastro ou uso. Não exigir liberação humana para abrir o fluxo público, nem inventar testes, preços, planos, resultados ou promoções. A oferta para contadores não é a de empresa comum. Não usar páginas Command para ofertas Cilos ou de outras empresas.\n";
