# Manutenção do conhecimento comercial

O responsável solicitou que a base comercial da IARA da Cilos acompanhe as novas funcionalidades desta ferramenta.

- Ao adicionar ou alterar funcionalidade do produto, revisar `docs/produtos/iara-comercial.md` e os trechos correspondentes em `server/roteiro-cilos.md`. Atualizar benefícios, disponibilidade real, requisitos e limites; não anunciar planos ou funcionalidades futuras como disponíveis.
- Ao publicar uma funcionalidade autorizada, sincronizar também a seção correspondente do contexto `cilos-comercial` no PostgreSQL de produção, com histórico de versão e cópia anterior. Ler o contexto atual antes de editar e preservar mudanças concorrentes e seções dos demais produtos. Verificar o carregamento no contexto de execução.
- Preservar o contexto `default` da Command ao atualizar produtos da Cilos e manter a separação entre conexões. Para o Command Server, o responsável autorizou a atualização da ficha `docs/produtos/command-server.md`, de `server/roteiro-comercial.md` e apenas da seção correspondente no contexto `default`. Conhecimento comercial não habilita integrações ou novas ferramentas por si só.
- A fonte indicada para o Command Server é a API oficial de versões documentada na ficha. Consultar com `scripts/consultar-commandserver.ps1`, que lê uma credencial protegida por DPAPI fora do repositório; não copiar o token para arquivos do projeto, URL ou prompt. A API de versões não contém uma tabela de preços: só atualizar preços mediante fonte comercial confirmada. A revisão de sexta-feira às 17h abrange Cilos e Command, com publicação separada em cada contexto.
- Nunca incluir credenciais, dados de clientes, segredos ou tokens nas fichas, prompts, Git ou relatórios. Não enviar mensagens reais como teste sem autorização explícita.
- Produção ativa em `/opt/command-comercial` na VPS `187.53.104.145`; a antiga pasta `C:\Projetos\prod\agente-comercial` está desativada. Não iniciá-la como parte de publicação.
