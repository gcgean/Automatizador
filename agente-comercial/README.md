# Command Comercial

Aplicação de atendimento comercial por WhatsApp Cloud API, com painel web, DeepSeek/Claude/Ollama/OpenAI compatível e PostgreSQL em produção.

## Código ativo

- Backend: `server/`.
- Painel React: `web/`.
- Execução de produção: `docker-compose.prod.yml`.
- Documentação técnica: `server/README.md`.
- Ligações WhatsApp atendidas pela equipe: [configuração e uso](docs/ligacoes-whatsapp.md).
- Segundo número Comercial Cilos: [conexão e contexto separados](docs/conexao-cilos.md).
- Responsáveis, atendimentos exclusivos e etiquetas: [como usar](docs/atendimentos-etiquetas.md).
- Emojis e compatibilidade dos áudios gravados: [como funciona](docs/emojis-e-audio.md).
- Mensagens na fila e confirmação de entrega: [conferir e liberar pendências](docs/entrega-mensagens.md).
- Histórico e instalação real: `AGENTE-COMERCIAL.md`.

Os arquivos JavaScript soltos da raiz recebidos na transferência são cópias anteriores; o Docker e os scripts do package.json executam a pasta `server/`.

## Desenvolvimento e testes

```powershell
npm ci
npm run build
npm start
```

O backend carrega `.env` da raiz; se ele não existir, aceita `server/.env` para compatibilidade. Variáveis do ambiente têm prioridade. Produção exige `DATABASE_URL` e usa PostgreSQL. O armazenamento JSON permanece apenas para testes locais e leitura da migração.

```powershell
npm test
# Integração com PostgreSQL isolado na porta 5548:
$env:TEST_DATABASE_URL='postgresql://postgres:qa-local-only@127.0.0.1:5548/postgres'
npm test
node tests/panel-qa.mjs
```

Os testes de banco e navegador só aceitam o PostgreSQL local de testes na porta 5548. Não executar contra o banco de produção.

## Acesso

O administrador usa e-mail e senha. A senha é definida por um link de primeiro acesso, de uso único, válido por 24 horas. Não há cadastro público. Após entrar, a aba Minha senha permite alterá-la e encerrar as outras sessões. A chave técnica antiga não autentica APIs quando PostgreSQL está habilitado.

## Produção Linux

Produção ativa na VPS `187.53.104.145`, pasta `/opt/command-comercial`.
Painel: https://comercial.gestorfacil.ia.br.

A antiga pasta `C:\Projetos\prod\agente-comercial` está desativada; não iniciar seus containers.
No servidor Linux, o serviço é gerenciado por `docker compose -f docker-compose.prod.yml`.
PostgreSQL não publica porta externa. O backup diário guarda banco e mídia, com retenção de 14 dias; cópia contínua fora da VPS ainda deve ser configurada separadamente.

- [Qualificação comercial e retorno dos anúncios à Meta](docs/anuncios-meta.md)
- [Melhorar texto com IA no campo da conversa](docs/melhorar-texto.md)

- [Conversas de vários números e cores](docs/conversas-multiplas-conexoes.md)
- [Custos Meta por conexão](docs/custos-meta.md)

- [Análise das conversas e sugestões de melhoria](docs/analise-conversas.md)

- [Agendamento por botões e confirmação no WhatsApp](docs/agendamento-botoes.md)

- [Empresas clientes e administradores por empresa](docs/empresas.md)

- [Lembretes de apresentação 30 minutos antes](docs/lembretes-apresentacao.md)

### CRM interno por empresa

A aba CRM organiza oportunidades em um funil próprio, separado de Conversas e da integração externa. Consulte [CRM interno](docs/crm-interno.md) para permissões, indicadores e limites.
