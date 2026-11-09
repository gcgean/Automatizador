# Automatizador

Este repositório reúne dois aplicativos independentes:

| Pasta | Aplicativo | Documentação |
| --- | --- | --- |
| `Automatizador/` | Nexo: aplicativo desktop Electron com navegador integrado e IA | [Abrir documentação](Automatizador/README.md) |
| `agente-comercial/` | Atendimento comercial por WhatsApp, painel React e backend Node.js | [Abrir documentação](agente-comercial/README.md) |

## Requisitos

- Node.js 22.12 ou superior e npm.
- Windows para executar o aplicativo desktop Nexo conforme sua documentação.
- As configurações de PostgreSQL, WhatsApp e provedores de IA do agente comercial estão descritas na documentação de cada aplicativo.

## Clonar

```powershell
git clone https://github.com/gcgean/Automatizador.git
cd Automatizador
```

## Nexo desktop

```powershell
cd Automatizador
npm ci
npm start
```

As chaves e o provedor de IA são configurados na interface do aplicativo.

## Agente comercial

A partir da raiz do repositório:

```powershell
cd agente-comercial
npm ci
Copy-Item .env.example .env
# Preencha o .env seguindo a documentação do backend antes de iniciar.
npm run build
npm start
```

Consulte [a documentação do backend](agente-comercial/server/README.md) e o exemplo `server/.env.example` para as variáveis adicionais, incluindo PostgreSQL e autenticação.

## Verificação

Execute dentro de cada aplicativo:

```powershell
npm test
npm run build
```

Alguns testes do agente comercial exigem um PostgreSQL de testes isolado; veja as instruções na documentação desse aplicativo.

## Arquivos locais

O Git ignora dependências, builds, arquivos `.env`, credenciais, perfis do navegador, conversas, dados e backups locais. Os arquivos `.env.example` servem de modelo para configurar outra instalação.

## Enviar alterações

A partir da raiz do repositório:

```powershell
git status
git add .
git commit -m "Descreva a alteração"
git push
```
