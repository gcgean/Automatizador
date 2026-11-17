# Empresas clientes

A empresa inicial **Operação atual** reúne todos os usuários, grupos, contextos e conexões anteriores. Conversas, mídias, leads, filas, relatórios, agenda, CRM, cadência e eventos Meta continuam nas mesmas conexões; não são copiados nem redistribuídos. O nome pode ser editado no cadastro.

## Administrar a plataforma

O usuário inicial configurado em ADMIN_EMAIL recebe o acesso de administrador da plataforma. Em **Configurações → Empresas**, ele pode criar empresas, editar nome/documento/contato e suspender ou reativar. O seletor **Empresa** no cabeçalho altera a empresa atendida pela sessão; a página recarrega para limpar os dados anteriores da tela. A troca fica indisponível durante ligações ativas. Outros navegadores com sessões próprias mantêm sua seleção.

Para cadastrar um cliente:

1. Crie a empresa e clique em **Acessar**.
2. Abra **Usuários**, cadastre a pessoa com perfil **Administrador** e compartilhe o link de ativação. Não há envio automático de e-mail.
3. Em **Conexões e contextos**, crie o contexto e cadastre o número com as credenciais Meta próprias do cliente. Números novos começam pausados e exigem validação antes da ativação.
4. Configure as integrações da conexão conforme necessário.

Administradores de empresa gerenciam usuários, permissões, contextos e conexões somente de sua empresa. Eles não criam empresas nem recebem o acesso de administrador da plataforma. Um login pertence a uma empresa; o e-mail é único na plataforma. Não há cadastro público nem adesão automática.

## Isolamento e suspensão

O servidor valida a empresa em todas as rotas de conexão e filtra os cadastros globais. URLs diretas, relatórios, anexos e custos não permitem consultar outra empresa. O banco rejeita vínculos de usuários/grupos/contextos com conexões de outra empresa e impede trocar a empresa de um registro que já possui histórico. Para outro cliente, crie registros próprios.

Suspender uma empresa encerra as sessões dos seus usuários e impede novos envios e o processamento das suas filas automáticas enquanto estiver suspensa. Uma requisição externa já em andamento pode terminar; não é cancelada retroativamente. Os registros recebidos e dados existentes são preservados. O administrador da plataforma pode reativar a empresa. Para suspender a empresa selecionada, acesse outra antes.

## Limites desta entrega

A infraestrutura, banco, versão do aplicativo e configuração dos provedores de IA são gerenciados pela plataforma. Conexões novas de outras empresas exigem credenciais Meta próprias e não herdam as da operação inicial. Agenda/CRM/cadência permanecem por conexão. Não há cobrança, planos, cotas ou banco/instalação dedicada por cliente nesta entrega.

Verificação local: testes com PostgreSQL isolado, duas empresas e contatos fictícios; cadastro, migração repetida, acesso por URL, proteção de vínculos, suspensão e login. Verificação em navegador de cadastro, troca de empresa, convite do administrador e layout em desktop/celular. Nenhuma mensagem real foi usada como teste.

Publicação conferida em 12/11/2026: empresa inicial criada com 5 usuários e 2 conexões; 58 históricos preservados. Serviço saudável, painel HTTP 200 e fontes em execução verificadas. Cópia do banco validada antes da migração. Contexto comercial Cilos atualizado para a versão 8 com cópia anterior e histórico; contexto Command preservado.
