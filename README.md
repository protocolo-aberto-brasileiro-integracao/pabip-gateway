# pabip-gateway

Implementação de referência de um gateway PABIP: uma ponte auto-hospedada
entre produtores de eventos de analíticos de imagem (sensor nodes) e
consumidores (sistemas de integração policial, callbacks HTTP, filas ou
bancos de dados).

## O que é o PABIP

**PABIP** — Protocolo Aberto Brasileiro de Integração Público-Privado para
Segurança Pública — é uma especificação técnica aberta para a cooperação
entre setor privado e poder público em segurança urbana no Brasil. É um
documento prescritivo: estabelece como qualquer integração entre um **Ente
Privado** (quem opera sensores, câmeras, analíticos de imagem) e um **Ente
Público** (quem consome esses dados) DEVE operar em cinco eixos —
autenticação, sensor nodes, vídeo, analíticos de imagem e contrapartida.

O protocolo em si é independente de qualquer implementação específica.
Este repositório é uma implementação de referência, não a especificação —
qualquer Ente Privado ou Ente Público pode implementar o PABIP do zero, sem
depender deste código.

## O que é o `pabip-gateway`

Em vez de cada Ente Privado reimplementar os dois lados do protocolo por
conta própria, o `pabip-gateway` é um serviço Docker único que já fala PABIP
nos dois sentidos:

- **Ingestão** — recebe eventos de analíticos de imagem dos sensor nodes do
  Ente Privado, valida, deduplica por janela de tempo e encaminha ao
  consumidor configurado.
- **Entrega (`output-sink`)** — entrega os eventos validados ao Ente Público
  por HTTP callback, por fila (Kafka, RabbitMQ, SQS ou Redis Streams) ou
  gravando direto em um banco Postgres/MySQL — a escolha é do operador.
- **Passthrough PABIP** — repassa chamadas de sensor-nodes, vídeo e detalhe
  de analíticos entre os dois lados, sem que o gateway precise entender o
  conteúdo dos dados que trafegam.
- **Cadastro de parceiros, tokens e configuração** — via `admin-api`, uma
  API administrativa separada do listener público, mais o
  [`pabip-gatewayctl`](./cli), um cliente de linha de comando para operar
  tudo isso sem depender de um painel visual.

O gateway não decide nada sobre o conteúdo dos dados que trafegam — é
infraestrutura de transporte, entrega e observação, com circuit breaker e
rate limiting por parceiro, trilha de auditoria e as métricas/health checks
que um operador de produção espera.

## Arquitetura, em poucas linhas

O processo é **stateless**: nenhum estado durável vive dentro do container,
tudo relevante fica no Postgres da própria instância (cadastro de parceiros,
tokens administrativos, configuração, trilha de auditoria). Ele expõe dois
listeners com exposição radicalmente diferente:

- **Público** (`gateway.publicPort`, padrão `8080`) — alcançável pela
  internet: o webhook de analíticos de imagem e o passthrough PABIP
  (`/peers/*`) para quem consome esses dados.
- **Admin** (`gateway.adminPort`, padrão `8081`) — nunca deve ser exposto
  fora da rede privada do operador: cadastro de parceiros, tokens,
  configuração, `/healthz`, `/readyz`, `/metrics`.

Veja [`OPERATIONS.md`](./OPERATIONS.md) para o modelo de rede completo,
requisitos de infraestrutura e o passo a passo de deploy.

## Começando

```
git clone <este repositório>
cd pabip-gateway
cp .env.example .env
npm install
docker compose -f docker-compose.dev.yml up -d
npx prisma migrate deploy
npm run start:dev
```

Veja [`CONTRIBUTING.md`](./CONTRIBUTING.md) para o guia completo de
desenvolvimento local (lint, build, testes unitários/integração/e2e) e
[`OPERATIONS.md`](./OPERATIONS.md) para rodar uma instância real em
produção.

## Documentação

| Documento | Para quem |
|---|---|
| [`CONTRIBUTING.md`](./CONTRIBUTING.md) | quem vai contribuir código a este repositório |
| [`OPERATIONS.md`](./OPERATIONS.md) | quem vai operar uma instância em produção |
| [`cli/README.md`](./cli/README.md) | quem vai usar o `pabip-gatewayctl` |

## Status

Em desenvolvimento ativo. Arquitetura e limites de módulo são acompanhados
por pull request.

## Licença

[Apache 2.0](./LICENSE).
