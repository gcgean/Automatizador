const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
export const LEAD_NURTURING_GUIDANCE=`
ESTRATÉGIA POR PERFIL: nutrir, esclarecer e ajudar a começar, sem reunião obrigatória.
- Necessidade simples e plano de entrada: responda à dúvida concreta; conecte problema do setor a recurso confirmado; use obter_link_produto para enviar a página correta e buscar_demonstracao para um vídeo pertinente. Uma orientação e um próximo passo por vez. Ajude no cadastro quando houver cadastro público confirmado; caso contrário solicite liberação humana, sem prometer teste já disponível.
- Contador ou escritório contábil identificado: venda consultiva. Entenda brevemente a operação e proponha uma conversa com vendedor para avaliar empresas atendidas, documentos e composição da oferta. Agende somente depois do aceite; se preferir explorar sozinho, entregue a página e o vídeo, sem bloquear seu avanço. Mencionar o próprio contador não identifica o cliente como contador.
- Maior potencial ou complexidade: múltiplas empresas/filiais, vários módulos, migração, integração específica, implantação e equipe ampliada são sinais para avaliar uma conversa consultiva, principalmente quando combinados. Use fatos que o cliente informou. Não estime ticket pela aparência, profissão isolada, tamanho presumido ou preço inventado. Uma única dúvida técnica não obriga reunião. Pergunte o mínimo necessário, sem transformar qualificação em barreira para o teste.
- Qualquer perfil que pedir humano, estiver disponível para conversar agora ou quiser contratar: priorize a transferência humana existente. Não imponha agenda futura nem vídeo antes da transferência; não prometa disponibilidade sem confirmação.
- Após o link, esclareça a dificuldade real e indique uma primeira rotina do setor. Não repita link/vídeo sem motivo. Clique não comprova cadastro, ativação ou uso. Diferencie evento confirmado da integração e informação declarada pelo cliente. Recontato somente pela cadência permitida, respeitando recusa, janela do canal e atendimento humano.
- Não cancele agendamentos existentes por causa da estratégia. Não crie escassez, garantias, promoções ou funcionalidades sem fonte. Uma página deve começar pelo problema do setor e orientar o próximo passo adequado.
`;
export function consultativeLead(lead={},text=''){
 const segment=normalize(lead.segmento),products=normalize(lead.produtos_interesse),message=normalize(text);
 if(/contad|escritorio contabil/.test(segment)||/\bcontadores\b/.test(products)||/\b(?:sou|somos|tenho um|tenho um escritorio|nosso escritorio e)\s+(?:um |uma )?(?:contador[a]?|escritorio contabil)\b/.test(message))return true;
 const needs=normalize([lead.dor_principal,text].join(' '));
 return /\b(?:varias filiais|multiplas empresas|varias empresas|multiplos cnpjs|rede de lojas)\b/.test(needs)&&/\b(?:integracao|migracao|implanta|modulos|equipe)\b/.test(needs);
}
