import {jsPDF} from 'jspdf';
import {autoTable} from 'jspdf-autotable';

const number = new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2});
const date = day => day?.split('-').reverse().join('/') || '—';
const text = value => String(value ?? '—').replace(/[^\x20-\x7e\xa0-\xff€–—“”‘’…•\n]/gu,' ');
const count = value => value == null ? '—' : number.format(value);
const money = (value,currency,precision=2) => value == null || !currency ? '—' :
  new Intl.NumberFormat('pt-BR',{style:'currency',currency,maximumFractionDigits:precision}).format(value);

export function buildMetaReportPdf({ads,whatsApp,filters,connectionNames,adsError,whatsAppError}) {
  const doc = new jsPDF({orientation:'landscape',unit:'mm',format:'a4',compress:true});
  const width = doc.internal.pageSize.getWidth(), height = doc.internal.pageSize.getHeight(), margin = 14;
  const currency = ads?.currency;
  const brl = value => money(value,currency);
  let y = 27;
  doc.setProperties({title:'Dashboard Meta',subject:'Relatório de campanhas do Command Comercial',creator:'Command Comercial'});

  function paragraph(value) {
    if (!value) return;
    doc.setFont('helvetica','normal').setFontSize(9).setTextColor(64,79,103);
    for (const line of doc.splitTextToSize(text(value),width-2*margin)) {
      if (y>height-18) { doc.addPage(); y=25; }
      doc.text(line,margin,y);
      y+=4.4;
    }
    y+=2;
  }

  function table(title,headers,rows) {
    if (y>height-39) { doc.addPage(); y=25; }
    doc.setFont('helvetica','bold').setFontSize(12).setTextColor(18,42,75).text(title,margin,y);
    autoTable(doc,{
      startY:y+4,margin:{top:23,bottom:16,left:margin,right:margin},
      head:[headers],body:rows.length ? rows.map(row=>row.map(text)) :
        [[{content:'Nenhum dado no período.',colSpan:headers.length}]],
      showHead:'everyPage',rowPageBreak:'avoid',
      styles:{font:'helvetica',fontSize:8.5,cellPadding:2.1,overflow:'linebreak',valign:'middle',textColor:[18,42,75]},
      headStyles:{fillColor:[18,63,110],textColor:[255,255,255]},alternateRowStyles:{fillColor:[239,245,251]}
    });
    y=doc.lastAutoTable.finalY+10;
  }

  paragraph('Período solicitado: '+date(filters.from)+' a '+date(filters.to));
  paragraph('Conexões: '+connectionNames.join(', '));
  const q = ads?.qualification;
  if (!q) paragraph('Anúncios: '+(adsError || ads?.error || ads?.notice || 'Dados indisponíveis.'));
  if (q) {
    paragraph('Janela comum de comparação: '+date(q.from)+' a '+date(q.to)+' · '+currency+' · '+ads.timezone);
    if (!ads.complete) paragraph('Consulta de anúncios parcial. Os valores são subtotais.');
    if (!q.windowAvailable) paragraph('O período solicitado é anterior à vigência dos destinos confirmados.');
    const t = q.totals;
    table('Resumo da janela comum',['Investimento elegível','Contatos','Qualificados','CPL estimado','Custo/qualificado','Taxa de qualificação'],
      [[brl(t.spend),count(t.contacts),count(t.qualified),brl(t.estimatedCpl),brl(t.costPerQualified),t.qualificationRate==null?'—':count(t.qualificationRate)+'%']]);
    if (q.best) paragraph('Menor custo observado: '+q.best.name+' · '+brl(q.best.costPerQualified)+' por qualificado.');

    table('Campanhas por custo de qualificação',['Campanha','Conexão','Invest. elegível','Contatos','Qualificados','Custo/qualificado','Observação'],
      q.campaigns.map(c=>[c.name,c.connectionName,brl(c.spend),count(c.contacts),count(c.qualified),brl(c.costPerQualified),c.reason]));
    table('Vendas por campanha · Cilos CRM',['Campanha','Conexão','Verificados / contatos','Vendas','Valor vendido','Custo/venda','Ticket médio','Retorno'],
      q.campaigns.filter(c=>c.destinationEligible).map(c=>[c.name,c.connectionName,count(c.crmVerified)+' / '+count(c.contacts),
        c.crmVerified ? count(c.won)+(c.undatedWon?' ('+c.undatedWon+' ganhos sem data)':'') : '—',
        brl(c.soldValue),brl(c.costPerSale),brl(c.averageSale),c.salesReturn==null?'—':count(c.salesReturn)+'×']));
    paragraph('Os ganhos confirmados no CRM entram quando fechados entre o último clique registrado e o fim da janela. O retorno divide o valor vendido pelo investimento elegível. Valores vendidos representam negócios ganhos.');
    table('Investimento e qualificados por dia',['Data','Investimento elegível','Contatos','Qualificados'],
      q.daily.map(d=>[date(d.day),brl(d.spend),count(d.contacts),count(d.qualified)]));
    if (ads.accountTotals) table('Investimento da conta de anúncios',['Conta inteira','Comercial selecionado','Recrutamento','Sem classificação'],
      [[brl(ads.accountTotals.spend),brl(ads.totals.spend),brl(ads.accountTotals.recruitmentSpend),brl(ads.accountTotals.unclassifiedSpend)]]);
    else table('Investimento no período solicitado',['Comercial selecionado'],[[brl(ads.totals.spend)]]);
    table('Detalhes dos anúncios',['Anúncio / campanha','Conexão','Investimento','Conversas Meta','Custo/conversa','Contatos locais','Qualificados','CPL estimado'],
      ads.rows.map(r=>[r.name+'\n'+r.campaign,r.connectionName,brl(r.spend),count(r.conversations),brl(r.costPerConversation),count(r.contacts),count(r.qualified),brl(r.estimatedCostPerContact)]));
    paragraph('O detalhamento mostra o investimento do período solicitado. Seu CPL usa a vigência individual do destino confirmado de cada campanha.');
    paragraph(q.definition);
    paragraph(ads.notice);
  }
  if (whatsApp?.rows.length) {
    if (!whatsApp.complete) paragraph('Consulta de WhatsApp parcial. Valores ausentes aparecem como —.');
    table('Custos de WhatsApp por conexão',['Conexão','Moeda','Mensagens','Custo mensagens','Ligações','Custo ligações','Total'],
      whatsApp.rows.map(r=>[r.name,r.currency,count(r.messages),money(r.messageCost,r.currency,5),count(r.calls),money(r.callCost,r.currency,5),
        r.status==='ok'?money(r.messageCost+r.callCost,r.currency,5):'—']));
    table('Custos de WhatsApp por dia',['Data','Conexão','Mensagens','Custo mensagens','Ligações','Custo ligações'],
      whatsApp.rows.flatMap(r=>r.days.map(d=>[date(d.day),r.name,count(d.messages),money(d.messageCost,r.currency,5),count(d.calls),money(d.callCost,r.currency,5)])));
    paragraph(whatsApp.notice);
  } else if (whatsAppError) {
    paragraph('WhatsApp: '+whatsAppError);
  }

  const exportedAt = new Intl.DateTimeFormat('pt-BR',{timeZone:'America/Sao_Paulo',dateStyle:'short',timeStyle:'short'}).format(new Date());
  const pages = doc.getNumberOfPages();
  for (let page=1; page<=pages; page++) {
    doc.setPage(page);
    doc.setFillColor(18,42,75).rect(0,0,width,17,'F');
    doc.setFont('helvetica','bold').setFontSize(15).setTextColor(255,255,255).text('Dashboard Meta',margin,11);
    doc.setFont('helvetica','normal').setFontSize(9).text('Command Comercial',width-margin,11,{align:'right'});
    doc.setTextColor(76,91,111).text('Exportado em '+exportedAt+' (Brasília)',margin,height-8);
    doc.text(page+' / '+pages,width-margin,height-8,{align:'right'});
  }
  return doc;
}
