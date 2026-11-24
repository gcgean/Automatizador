from pathlib import Path
import json,html
from reportlab.platypus import SimpleDocTemplate,Paragraph,Spacer,Table,TableStyle,PageBreak,KeepTogether
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet,ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.enums import TA_LEFT
ROOT=Path(r'C:\Projetos\dev\Automatizador')
OUT=ROOT/'output/pdf/AppBarber_Integracao_WhatsApp_Command.pdf'
pdfmetrics.registerFont(TTFont('Arial',r'C:\Windows\Fonts\arial.ttf'))
pdfmetrics.registerFont(TTFont('ArialBold',r'C:\Windows\Fonts\arialbd.ttf'))
pdfmetrics.registerFontFamily('Arial',normal='Arial',bold='ArialBold',italic='Arial',boldItalic='ArialBold')
navy=colors.HexColor('#132C49');blue=colors.HexColor('#087BF2');muted=colors.HexColor('#53677B');light=colors.HexColor('#EFF5FB');line=colors.HexColor('#D5E2EE');green=colors.HexColor('#08785F')
styles=getSampleStyleSheet()
for n in ['Normal','BodyText']:styles[n].fontName='Arial'
styles.add(ParagraphStyle(name='Body',fontName='Arial',fontSize=10,leading=14.5,textColor=navy,spaceAfter=9))
styles.add(ParagraphStyle(name='Smallx',fontName='Arial',fontSize=8.3,leading=11.5,textColor=muted,spaceAfter=7))
styles.add(ParagraphStyle(name='Titlex',fontName='ArialBold',fontSize=27,leading=32,textColor=navy,spaceAfter=16))
styles.add(ParagraphStyle(name='H2x',fontName='ArialBold',fontSize=19,leading=24,textColor=navy,spaceAfter=14))
styles.add(ParagraphStyle(name='H3x',fontName='ArialBold',fontSize=11.5,leading=16,textColor=blue,spaceBefore=9,spaceAfter=6))
styles.add(ParagraphStyle(name='Cell',fontName='Arial',fontSize=8.7,leading=12,textColor=navy))
styles.add(ParagraphStyle(name='CellSmall',fontName='Arial',fontSize=7.6,leading=10.2,textColor=navy,wordWrap='CJK'))
styles.add(ParagraphStyle(name='Th',fontName='ArialBold',fontSize=8.8,leading=12,textColor=colors.white))
story=[]
def p(t,style='Body'):return Paragraph(t,styles[style])
def add(t,style='Body'):story.append(p(t,style))
def h(t):add(t,'H3x')
def table(headers,rows,widths,small=False):
 cells=[[p(x,'Th') for x in headers]]+[[p(str(x),'CellSmall' if small else 'Cell') for x in row] for row in rows]
 t=Table(cells,colWidths=widths,repeatRows=1,hAlign='LEFT');t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),navy),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),9),('RIGHTPADDING',(0,0),(-1,-1),9),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('ROWBACKGROUNDS',(0,1),(-1,-1),[colors.white,light]),('LINEBELOW',(0,0),(-1,0),.5,navy),('LINEBELOW',(0,1),(-1,-1),.3,line)]));story.append(t);story.append(Spacer(1,10))
def box(title,text):
 t=Table([[p(title,'H3x')],[p(text)]],colWidths=[499]);t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,-1),light),('BOX',(0,0),(-1,-1),.5,line),('LEFTPADDING',(0,0),(-1,-1),13),('RIGHTPADDING',(0,0),(-1,-1),13),('TOPPADDING',(0,0),(-1,0),5),('BOTTOMPADDING',(0,-1),(-1,-1),7)]));story.append(t);story.append(Spacer(1,12))
def page(k,title):
 if story:story.append(PageBreak())
 add(k.upper(),'Smallx');add(title,'H2x')
page('01 / Visão geral','Sua barbearia no WhatsApp,<br/>conectada ao AppBarber')
add('Análise de viabilidade e guia de recursos, custos e implantação','H3x')
add('Preparado pela Command System • Consulta em 23/11/2026','Smallx')
box('É possível integrar','A API oficial possui os recursos centrais para consultar horários e registrar agendamentos no AppBarber a partir de uma conversa no WhatsApp. A integração específica com a plataforma Command precisa ser desenvolvida, configurada e testada antes de entrar em operação.')
h('Como seria na prática')
for a,b in [('1. O cliente conversa','Informa o serviço, a data e, se desejar, o barbeiro de preferência.'),('2. A IA consulta o sistema','Busca o catálogo e os horários disponíveis no AppBarber, sem inventar vagas ou valores.'),('3. O cliente escolhe','A plataforma apresenta opções e confirma os dados antes de reservar.'),('4. O AppBarber registra','Após a resposta de sucesso da API, o cliente recebe a confirmação e os dados do agendamento.')]:add('<b>'+a+'</b><br/>'+b)
h('O que esta análise cobre')
add('Foram identificadas <b>38 operações documentadas</b>, distribuídas entre agenda, serviços, profissionais, clientes, assinaturas, fidelidade, produtos, comandas, empresa, financeiro e relatórios. O inventário completo está nas páginas 6 e 7.')
add('Este documento descreve possibilidades técnicas e preços públicos da API. Não é contrato, orçamento de implantação nem confirmação de que a integração já está habilitada. Não foram executados testes na conta da barbearia.','Smallx')
page('02 / Recursos disponíveis','O que a API fornece')
table(['Área','Recursos confirmados na documentação'],[
('Serviços e profissionais','Catálogo de serviços, duração e valores; profissionais disponíveis por serviço e catálogo geral de profissionais.'),
('Disponibilidade e agenda','Horários por data e serviço ou combo, organizados por profissional; criação de agendamento com um ou vários serviços; retorno dos códigos gerados e link de confirmação.'),
('Status e histórico','Confirmar ou retirar confirmação; marcar ou retirar preferência; registrar presença no local. Histórico com filtros de período, filial, código e status: agendado, realizado, cancelado, bloqueado ou ausente.'),
('Clientes','Buscar clientes com paginação e filtros por nome/celular; cadastrar, alterar e remover. Dados cadastrais e de contato, observações, último agendamento, dias sem agendamento e campos de fidelidade, conforme retorno disponível.'),
('Empresa e filiais','Dados cadastrais, horários de funcionamento, imagens e filiais. Lista de aniversariantes dos próximos sete dias.'),
('Assinaturas','Consultar assinantes e seus planos, datas e status. Há escopos distintos para planos individuais e planos multiunidade; não são uma lista única equivalente.'),
('Fidelidade','Consultar itens do programa e saldo/pontos do cliente. Não foi identificado endpoint específico para conceder pontos ou efetuar resgates.'),
('Produtos','Listar, cadastrar, alterar e remover produtos; atributos de preço, marca, categoria, imagem, comissão, pontos e disponibilidade para venda/apresentação. O cadastro inclui quantidade mínima em estoque.')
],[105,394])
add('A página comercial menciona gerenciamento de estoque. Na especificação analisada, não há operação dedicada de entrada/saída de estoque nem campo de saldo atual no modelo de consulta de produtos. Esse alcance precisa ser confirmado com o AppBarber. [1][2]','Smallx')
page('03 / Gestão e automações','Além de agendar: relacionamento e gestão')
h('Comandas, caixa e relatórios')
add('<b>Comandas:</b> buscar abertas por período, buscar por telefone ou código, consultar itens, registrar dados de pagamento, cancelar comanda aberta com motivo e remover um item com motivo. Registrar pagamento no sistema não comprova a existência de uma integração para cobrar cartão ou gerar Pix.')
add('<b>Financeiro:</b> consultar tipos e bandeiras de pagamento, caixa de uma data, movimentações e histórico de caixas; obter relatório consolidado de entradas, saídas e saldo.')
add('<b>Relatórios:</b> rankings de serviços, produtos e categorias por quantidade ou valor. O ranking de categorias pode ser detalhado por profissional, com filtros próprios. Esses dados permitem construir painéis externos.')
h('O que podemos construir com esses dados')
table(['Aplicação proposta','Como seria utilizada'],[
('Atendimento e reservas','IA atende a qualquer hora e agenda somente nos horários retornados pelo AppBarber.'),
('Lembretes e confirmação','Rotina da plataforma consulta a agenda e envia lembretes pelo WhatsApp, respeitando regras do canal e preferências do cliente.'),
('Retorno e relacionamento','Identificar clientes há mais tempo sem agendar, aniversariantes e histórico para um contato contextualizado. Disparos precisam ser configurados separadamente.'),
('Painel da barbearia','Acompanhar agenda, serviços mais procurados, produtos mais vendidos e indicadores financeiros autorizados ao gestor.')
],[125,374])
box('Limites que precisam ficar claros','Não foi encontrado endpoint direto de remarcação. Cancelar e criar novamente é uma possibilidade a validar, não uma funcionalidade garantida. O cancelamento documentado é de comanda/item: é preciso testar seus efeitos na agenda, principalmente quando houver vários serviços ou pagamentos.')
add('Lembretes, campanhas, painéis e automações acima são propostas de desenvolvimento. A API fornece os dados e operações; não entrega esses fluxos prontos na plataforma Command. [2]','Smallx')
page('04 / Custos','Quanto custa e como calcular')
box('Preço público da API AppBarber','<b>R$ 100,00 por pacote de 5.000 requisições, por unidade.</b><br/>Equivalência: R$ 0,02 por requisição. A documentação informa débito por requisição bem-sucedida. O pacote é de chamadas à API, não de mensagens nem de agendamentos. [1][2]')
add('Exemplo ilustrativo: se um fluxo utilizar cinco chamadas bem-sucedidas para consultar dados e registrar a reserva, o consumo equivalente será R$ 0,10. A quantidade real varia com as consultas do cliente, paginação, serviços e reaproveitamento de dados.')
table(['Agendamentos no mês¹','Chamadas estimadas','Consumo equivalente','Pacotes / compra²'],[
('300','1.500','R$ 30,00','1 / R$ 100,00'),('1.000','5.000','R$ 100,00','1 / R$ 100,00'),('2.000','10.000','R$ 200,00','2 / R$ 200,00')],[122,115,127,135])
add('¹ Simulação de cinco chamadas por agendamento; não inclui outras consultas, relatórios, contatos sem reserva ou rotinas automáticas. ² Compra em pacotes inteiros, supondo saldo inicial zero. Confirmar validade e aproveitamento de créditos não utilizados; não há regra explícita nas páginas consultadas.','Smallx')
h('O orçamento total tem outras partes')
table(['Componente','Como considerar no orçamento'],[
('Plano do AppBarber','Conta ativa é obrigatória. Mensalidade do sistema não está incluída no pacote da API; consultar o contrato da barbearia.'),
('Plataforma Command e integração','Licença, implantação, desenvolvimento, suporte e manutenção serão definidos em proposta própria. Não há valores aprovados neste documento.'),
('WhatsApp/Meta e IA','Consumo e eventuais tarifas são separados. Dependem do canal, das mensagens enviadas e do provedor de IA contratado.'),
('Infraestrutura','Servidor com IP fixo e operação da integração. Confirmar inclusão ou cobrança na proposta da Command.')
],[125,374])
add('O site não estabelece R$ 100 como mensalidade fixa da API. Apresenta compra por pacote. Taxas adicionais, validade dos créditos, condições por filial e eventual valor de ativação devem constar do contrato. Preço consultado em 23/11/2026, sujeito a atualização.','Smallx')
page('05 / Contratação e implantação','O que é necessário para começar')
h('Responsabilidades da barbearia')
add('Ter conta ativa no AppBarber e <b>CNPJ ativo vinculado ao estabelecimento</b>. A solicitação e o contrato devem ser feitos pelo gestor titular; o fornecedor informa que não negocia esse acesso com desenvolvedores avulsos.')
add('No AppBarber, acessar <b>Perfil → Conta → API Externa</b>. Se a opção não aparecer, solicitar à equipe. Depois, assinar o contrato, informar o IP fixo da integração e comprar créditos. A página anuncia ativação imediata após contrato, mas a entrada em operação na Command depende de configuração e testes. [1]')
h('Configuração técnica da integração')
add('A API usa a chave <b>X-API-Key</b> e o código do estabelecimento. As credenciais ficam no servidor e vinculadas à empresa correta. O servidor precisa ter IP fixo autorizado. Os limites publicados são <b>1.000 requisições por hora por chave</b> e <b>30 por minuto por IP</b>; várias empresas no mesmo IP exigem planejamento. [2]')
add('Ao zerar o saldo, a documentação prevê recusa de acesso (403), com retorno após recarga. Consultas repetidas devem ser controladas; catálogo pode ser reaproveitado, mas a disponibilidade deve ser conferida novamente antes da reserva.')
h('Validações antes de liberar para os clientes')
add('Testar horários concorrentes, múltiplos serviços, identificação do cliente, confirmação, saldo insuficiente e cancelamento. Em caso de timeout, conferir se a reserva foi criada antes de repetir. Algumas alterações de status alternam o estado a cada chamada; repetição indiscriminada pode desfazer a confirmação.')
add('Não foram documentados webhooks nem chave de idempotência na especificação consultada. A sincronização pode exigir consultas programadas. Histórico de agenda, histórico de caixa e relatório financeiro: até 31 dias por consulta; comandas abertas e rankings: até 90 dias. Textos enviados à API não aceitam emojis de quatro bytes. [2]')
h('Escopo inicial sugerido')
add('Começar com serviços, profissionais, disponibilidade, identificação do cliente e criação de reservas. Liberar cancelamento após testes. Acrescentar lembretes, relacionamento e relatórios em etapas posteriores, conforme o escopo contratado.')
h('Fontes oficiais e versão')
add('[1] <link href="https://materiais.appbarber.com.br/api-oficial-appbarber" color="#087BF2">Página comercial da API AppBarber</link> - recursos anunciados, preço e contratação.<br/>[2] <link href="https://api-docs-appbarber.calm-breeze-b4e7.workers.dev/" color="#087BF2">Documentação técnica e especificação OpenAPI</link> - API 1.0.0, OpenAPI 3.0.3; 38 operações. Consultadas em 23/11/2026.<br/>Suporte do fornecedor: <link href="mailto:suporte@appbarber.com.br" color="#087BF2">suporte@appbarber.com.br</link>.','Smallx')
spec=json.load(open(r'C:\Users\Pichau\Downloads\api-appbarber.json',encoding='utf8'))
ops=[(verb.upper(),path,item.get('summary','')) for path,verbs in spec['paths'].items() for verb,item in verbs.items() if verb in ['get','post','put','delete','patch']]
# Preserve the source inventory; technical paths are included for implementers.
for part,items in enumerate([ops[:20],ops[20:]],1):
 page(f'0{5+part} / Anexo técnico',f'Inventário completo de operações ({part}/2)')
 add('Rotas publicadas na especificação oficial. Base: https://api.appbarber.com. GET consulta; POST cria; PUT altera; DELETE remove ou cancela conforme a operação. [2]','Smallx')
 table(['Método','Rota','Finalidade'],[[v,html.escape(path),html.escape(title)] for v,path,title in items],[55,245,199],small=True)
 if part==2:
  box('Recurso documentado não significa recurso já implantado','Este inventário define o que o fornecedor expõe na API. Cada função precisa ser integrada, autorizada e testada. Dados financeiros e alterações administrativas devem ficar restritos aos usuários habilitados da barbearia.')

def footer(c,d):
 c.setFillColor(blue);c.rect(0,824,595.28,18,fill=1,stroke=0)
 c.setFillColor(navy);c.setFont('ArialBold',9);c.drawString(48,803,'COMMAND SYSTEM  /  INTEGRAÇÕES')
 c.setStrokeColor(line);c.line(48,44,547,44);c.setFont('Arial',8);c.setFillColor(muted);c.drawString(48,30,'AppBarber + WhatsApp  •  Análise em 23/11/2026');c.drawRightString(547,30,str(d.page))
doc=SimpleDocTemplate(str(OUT),pagesize=(595.28,841.89),leftMargin=48,rightMargin=48,topMargin=62,bottomMargin=57,title='AppBarber + WhatsApp | Recursos, custos e integração',author='Command System')
doc.build(story,onFirstPage=footer,onLaterPages=footer)
print(OUT)
