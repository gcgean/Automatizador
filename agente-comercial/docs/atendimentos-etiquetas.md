# Responsáveis e etiquetas de atendimento

Ao transferir uma conversa, a lista passa a mostrar **Com [responsável]**. Para o próprio atendente, aparece **Com você**. O histórico informa que o atendimento é exclusivo do responsável e dos administradores.

A exclusividade é definida por `assignedUserId` e vale também para atendimentos antigos, inclusive depois de ganhos ou descartados. Retomar a IA remove a atribuição, conforme o fluxo existente. Atendimentos sem responsável continuam disponíveis para a equipe autorizada na conexão.

O servidor protege listas, histórico, ações sobre contatos, anexos, fotos, filas, ligações, agenda, CRM, relatórios e exportação. A restrição é aplicada mesmo em acessos por URL. Análises de aprendizado de toda a conexão são reservadas a administradores, pois podem reunir informações de vários responsáveis. Uma resposta administrativa preserva o responsável atual; para trocar o responsável, use a transferência.

As permissões da conexão continuam obrigatórias. Ser o responsável não concede acesso a outra conexão ou a funções que seu perfil não possui. A lista do navegador acompanha transferências na atualização automática de cinco segundos. Dados que já foram exibidos no navegador antes de uma transferência não podem ser recuperados pelo servidor.

## Etiquetas

No histórico, clique em **Etiquetas** para selecionar etiquetas existentes ou criar uma com nome e cor. As etiquetas aparecem também nos contatos, e o filtro **Todas as etiquetas** permite localizar as conversas correspondentes.

- As etiquetas são internas ao painel e compartilhadas somente dentro da conexão WhatsApp correspondente.
- Cada atendimento aceita até 10 etiquetas. Cada conexão aceita até 100, com nomes de até 40 caracteres.
- Desmarcar uma etiqueta a remove daquele atendimento e preserva o catálogo para os demais contatos.
- Criar e aplicar etiquetas usa a permissão existente **Classificar leads, etiquetas e encerramentos**. Perfis de leitura apenas visualizam as etiquetas dos atendimentos aos quais têm acesso.
- Etiquetas não enviam mensagens ao cliente, não alteram a agenda e não mudam a classificação quente/morno/frio.

As tabelas `contact_tags` e `lead_tags` são criadas automaticamente. Nenhuma transferência, conversa ou agendamento existente é regravado na atualização.
