# Contributing

Thanks for looking at `pabip-gateway`. This document covers what you need
to build, lint, and test the project locally before sending a pull request.
If you're looking for how to *deploy and operate* an instance instead, see
[`OPERATIONS.md`](./OPERATIONS.md).

## Prerequisites

- Node.js >= 20 (matches `engines.node` in both `package.json` and
  `cli/package.json`).
- Docker, for a local Postgres — the project ships
  `docker-compose.dev.yml` for exactly this, so you don't need Postgres
  installed on your host.
- npm (this repo is an npm-workspaces monorepo — the root `package.json`
  and `cli/package.json` share one `package-lock.json`; a single `npm
  install` at the repo root installs both).

## Repository layout

```
.
├── src/            # the gateway itself (NestJS)
├── test/           # e2e and cross-module integration specs
├── prisma/         # schema + migrations for the gateway's own registry
├── cli/            # pabip-gatewayctl — a separate npm workspace, its own
│                    # package.json/tsconfig/tests, thin HTTP client of
│                    # admin-api only
├── Dockerfile
├── docker-compose.dev.yml         # local Postgres for `npm run start:dev`
└── docker-compose.prod.yml.example
```

## Setup

```
git clone <this repo>
cd pabip-gateway
cp .env.example .env       # fill in at least DATABASE_URL/GATEWAY_ENTE_PUBLICO_NAME
npm install                # installs both workspaces (root + cli/); also
                            # runs `prisma generate` for both Prisma schemas
docker compose -f docker-compose.dev.yml up -d   # local Postgres
npx prisma migrate deploy  # applies the schema to it
```

`npm install`'s `postinstall` regenerates both Prisma clients
(`src/generated/prisma`, `src/generated/output-sink-prisma`) — re-run it
manually (`npx prisma generate && npx prisma generate --schema=prisma/output-sink/schema.prisma`)
any time you change either `schema.prisma` file without a full reinstall.

## Running it locally

```
npm run start:dev        # gateway, watch mode — needs the .env above and Postgres up
node cli/dist/main.js --help   # after `npm run build:cli`, or just `npm run start --workspace=cli -- --help`
```

## Lint

```
npm run lint              # gateway (src/, test/)
npm run lint:cli           # cli/ (thin wrapper around `npm run lint --workspace=cli`)
```

Both run in CI on every pull request, but running them locally first
saves a round trip.

`npm run format` (Prettier, `src/`/`test/` only) fixes most style issues
`lint` would otherwise flag.

## Build

```
npm run build              # gateway -> dist/
npm run build:cli          # cli/ -> cli/dist/
```

Both use `tsc` under the hood (`nest build` for the gateway) — a type error
in either fails the build the same way it would fail a real release build.

## Tests

```
npm test                   # gateway unit specs (src/**/*.spec.ts)
npm run test:cov           # same, with coverage
npm run test:cli           # cli/ unit specs
```

Two more suites need a real Postgres (`docker compose -f docker-compose.dev.yml up -d`
first, and a `.env` with a working `DATABASE_URL`):

```
npm run test:integration    # cross-module specs against a real Postgres (*.integration-spec.ts)
npm run test:e2e            # full HTTP surface, real Postgres (test/*.e2e-spec.ts)
```

Run all four (plus both lints and both builds) before opening a PR.

## Commit and PR conventions

- [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`,
  `fix:`, `refactor:`, `test:`, `docs:`, `chore:`) in English.
- Keep PRs scoped to one deliverable/concern — this codebase is organized
  as a sequence of module-sized changes (see recent commit history for the
  pattern), and a PR that mixes unrelated modules is harder to review than
  two smaller ones.
- If a change touches a non-obvious architectural decision, say so
  explicitly in the PR description along with the reasoning — don't leave
  a structural change implicit in a diff.
