# Conexão Comercial Cilos

Número: +55 11 95507-5868. Identificador no painel: `cilos-comercial`.

A conexão usa credenciais criptografadas próprias, contexto comercial independente e o modo `waba_override`. O aplicativo Cilos Suporte mantém seu webhook original. Apenas os eventos da conta Cilos Atendimento são encaminhados ao webhook deste painel.

A ativação confere os números da conta antes de configurar o callback. Se houver um número não preparado no painel ou uma lista paginada que impeça verificar a conta inteira, a ativação é interrompida. Não troque o modo desta conexão para `app`.

O roteiro inicial fica em [server/roteiro-cilos.md](../server/roteiro-cilos.md) e é carregado em um contexto exclusivo da Cilos. Ele permite recepção, qualificação e passagem à equipe; não contém catálogo detalhado, preços, condições ou disponibilidade. Edite o contexto da Cilos em **Configurações → Conexões e contextos** quando essas informações forem aprovadas. Alterações no arquivo do repositório não substituem automaticamente um contexto já salvo no banco.

CRM, agenda e cadência são configurações por conexão. Elas não são copiadas da conexão Command.

![Comercial Cilos](assets/logo-cilos-comercial.jpg)

As credenciais locais ficam em `server/.env.cilos`, fora do Git. Não publique o documento original de transferência, pois ele contém um PIN. A integração usa as credenciais criptografadas no banco de produção; o arquivo local não substitui o `.env` principal do servidor.

## Cadastro em coexistência

Configure META_EMBEDDED_SIGNUP_CONFIG_ID no servidor com a configuração de Login do Facebook para Empresas do app comercial. Se o app for diferente do padrão do servidor, defina também META_EMBEDDED_SIGNUP_APP_ID e META_EMBEDDED_SIGNUP_APP_SECRET para esse mesmo app. Autorize o domínio do painel na Meta. Para o aplicativo com callback compartilhado, confira os campos messages, smb_message_echoes, smb_app_state_sync e history na assinatura existente.

Em Configurações → Conexões e contextos → Nova conexão, escolha “Usar WhatsApp Business do celular”, informe nome, contexto e IA e clique em “Conectar com a Meta”. O titular confirma o vínculo no aplicativo. O servidor confere a WABA e o número, salva o token criptografado e solicita a sincronização durante a ativação. Se a validação falhar após salvar, abra a conexão e use “Validar Meta e ativar”. O conteúdo importado depende da autorização de compartilhamento e da entrega pela Meta.
