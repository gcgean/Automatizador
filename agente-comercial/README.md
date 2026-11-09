# Command Comercial

Aplicação de atendimento comercial por WhatsApp Cloud API, com painel web, DeepSeek/Claude/Ollama/OpenAI compatível e PostgreSQL em produção.

## Código ativo

- Backend: `server/`.
- Painel React: `web/`.
- Execução de produção: `docker-compose.prod.yml`.
- Documentação técnica: `server/README.md`.
- Ligações WhatsApp atendidas pela equipe: [configuração e uso](docs/ligacoes-whatsapp.md).
- Segundo número Comercial Cilos: [conexão e contexto separados](docs/conexao-cilos.md).
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

## Produção neste computador

Pasta: `C:\Projetos\prod\agente-comercial`.

Painel: https://comercial.gestorfacil.ia.br.

```powershell
cd C:\Projetos\prod\agente-comercial
docker compose -f docker-compose.prod.yml up -d --build
docker compose -f docker-compose.prod.yml ps
```

PostgreSQL usa volume nomeado persistente e não publica porta externa. O backup faz `pg_dump` a cada 24 horas para `backups/`, com retenção de 14 dias. Guarde também cópias em outro dispositivo para proteção contra perda deste computador.
