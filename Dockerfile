# syntax=docker/dockerfile:1
#
# Multi-stage build for `pabip-gateway` — this file, and only this file
# plus `docker-compose.prod.yml.example`/`OPERATIONS.md`, is what ships in
# this repo; building and publishing an official image from it is left to
# whoever operates a given release channel, not automated here.
#
# Debian slim over Alpine for the runtime stage: Prisma's migration engine
# (bundled inside the `prisma` package, needed by `docker-entrypoint.sh` at
# every container start) is a native binary, and glibc/OpenSSL compatibility
# on Alpine's musl libc has repeatedly been a source of "engine failed to
# start" issues for Prisma specifically — Debian slim is the combination
# Prisma's own docs recommend to sidestep that class of problem, at the cost
# of a slightly larger base image than Alpine.
#
# Multi-arch: this Dockerfile has no architecture-specific
# steps — every stage resolves its own native dependencies (npm packages,
# Prisma's engine binaries) for whatever platform it runs under. Build both
# supported architectures with buildx, e.g.:
#   docker buildx build --platform linux/amd64,linux/arm64 -t pabip-gateway:local .

ARG NODE_IMAGE=node:20-bookworm-slim

# ---------------------------------------------------------------------------
# deps: every workspace's dependencies (including devDependencies), needed to
# type-check and build both packages this repo ships (the gateway app and
# `cli/`).
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS deps
# `openssl` here too, matching `runtime` below — `prisma generate`'s
# postinstall (triggered by `npm ci` right below) probes for it to pick the
# right engine build; without it present at generate time it silently
# assumes an older OpenSSL 1.1.x engine, which doesn't match what's
# actually on the OpenSSL 3.x `runtime` image these engines end up running
# against.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY cli/package.json cli/package.json
# The root `postinstall` (`prisma generate`, x2) that `npm ci` triggers below
# needs the schema files on disk to run at all — copied here, ahead of the
# rest of the source (`COPY . .` in `build` below), so this stage's own
# `npm ci` layer only invalidates when a dependency or the schema itself
# changes, not on every unrelated source edit.
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
# Also needed here, ahead of `npm ci`: Prisma's `prisma-client` generator
# auto-detects this project's module/emit shape (CJS-via-tsc, not a
# bundler/ts-node runtime) from `tsconfig.json` — without it on disk yet at
# generate time, the generator falls back to a default that emits its own
# internal relative imports with a literal `.ts` extension
# (`require("./internal/class.ts")`), which crashes at container boot since
# only the compiled `.js` sibling ever ships in `dist` (confirmed by
# reproducing the boot crash with this file absent, and fixing it by
# copying it in before generate — see incident notes).
COPY tsconfig.json tsconfig.build.json ./
RUN npm ci

# ---------------------------------------------------------------------------
# build: compiles both packages. `npm run build` also regenerates the Prisma
# clients via the root `postinstall` already run in `deps` — nothing here
# talks to a real database, `prisma generate` only reads the schema files.
# ---------------------------------------------------------------------------
FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build \
  && npm run build --workspace=cli

# ---------------------------------------------------------------------------
# prod-deps: production-only `node_modules` for the gateway app — a
# from-scratch `npm ci --omit=dev`, not a prune of `deps`, so nothing a
# devDependency pulled in transitively survives by accident. `prisma` and
# `dotenv` are ordinary (non-dev) dependencies (see root `package.json`):
# both are required at container *runtime*, not just at build time —
# `docker-entrypoint.sh` runs `./node_modules/.bin/prisma migrate deploy` on
# every container start, and `prisma.config.ts` itself does
# `import 'dotenv/config'`, which the Prisma CLI evaluates when it loads
# that file.
#
# Deliberately *not* `--ignore-scripts`: the `prisma`/`@prisma/*` packages
# fetch their own platform-specific schema/query-engine native binaries from
# a lifecycle script during `npm ci` itself, not from `prisma generate` —
# skipping scripts here previously produced a `node_modules/prisma` with no
# engine binary at all, failing every `migrate deploy` at container start.
# The root project's own `postinstall` (`prisma generate`, x2) rides along
# as a side effect and is redundant (the real generated client is copied in
# from `build` below), but harmless — it only reads the schema files also
# copied into this stage, never touches a database.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS prod-deps
# Same reasoning as `deps` above: present so the engine binaries fetched
# during `npm ci` below match this stage's own OpenSSL, not a guessed
# default.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
# `cli/package.json` too — this is a single npm-workspaces tree (`cli` is a
# workspace of the root `package.json`), so a workspace-aware `npm ci`
# needs every member's manifest to resolve correctly, and `cli/dist/main.js`
# needs its own runtime dependency (`commander`) actually present in
# `node_modules` to run at all inside this image (`pabip-gatewayctl`, see
# `runtime`'s symlink below).
COPY cli/package.json cli/package.json
COPY prisma ./prisma
COPY prisma.config.ts ./prisma.config.ts
RUN npm ci --omit=dev

# ---------------------------------------------------------------------------
# runtime: the image that actually ships. Non-root (`node`, uid 1000 — the
# official Node images already create this user for exactly this purpose),
# and every path written to at runtime is confined to what
# `docker-compose.prod.yml.example` mounts as a writable volume/tmpfs, so the
# container also runs correctly with `--read-only` on the root filesystem.
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS runtime
RUN apt-get update \
  && apt-get install -y --no-install-recommends tini openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
ENV NODE_ENV=production
# The `node` user has no writable $HOME by default on this base image; tools
# that fall back to $HOME for a cache/config dir (npm itself, if ever
# invoked) would otherwise try to write under `/home/node`, which is part of
# the read-only root filesystem this image is built to run under. `/tmp` is
# always the one writable path this container needs regardless (see
# `docker-compose.prod.yml.example`'s `tmpfs` mount), so it doubles as $HOME.
ENV HOME=/tmp

# `--chown` on every `COPY` below rather than one trailing `RUN chown -R` —
# the latter would add a full extra pass (and layer) rewriting ownership of
# everything under `node_modules`, which is most of this image's size.
COPY --chown=node:node --from=prod-deps /app/node_modules ./node_modules
# npm places a workspace member's own dependencies (`cli`'s `commander`)
# under that workspace's own `node_modules`, not hoisted to the root one,
# whenever `--omit=dev` is in play — copied separately here rather than
# assumed to already be reachable through `./node_modules` above.
COPY --chown=node:node --from=prod-deps /app/cli/node_modules ./cli/node_modules
COPY --chown=node:node --from=build /app/dist ./dist
COPY --chown=node:node --from=build /app/cli/dist ./cli/dist
COPY --chown=node:node package.json ./package.json
COPY --chown=node:node prisma ./prisma
COPY --chown=node:node prisma.config.ts ./prisma.config.ts
COPY --chown=node:node docker-entrypoint.sh docker-healthcheck.js ./

RUN chmod +x docker-entrypoint.sh cli/dist/main.js \
  && ln -s /app/cli/dist/main.js /usr/local/bin/pabip-gatewayctl

USER node

# Public webhook (`gateway.publicPort`) and admin-api (`gateway.adminPort`)
# — matching `config.constants.ts`'s own defaults so the image is usable
# out of the box without every operator having to override both.
EXPOSE 8080 8081

# `docker-healthcheck.js` only ever probes `/healthz` — liveness, never a
# dependency check — so this reports the same signal an orchestrator's own
# liveness probe would, for anyone running via `docker run`/plain compose
# without one.
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "docker-healthcheck.js"]

# tini as PID 1: Node does not forward signals to child processes or reap
# zombies when it is PID 1 itself, which would silently swallow the
# `SIGTERM` `main.ts`'s graceful-shutdown handler depends on across a
# `docker stop`/rolling replace. tini sits above `docker-entrypoint.sh`
# instead, forwarding `SIGTERM` straight through to whichever process that
# script `exec`s.
ENTRYPOINT ["/usr/bin/tini", "--", "/app/docker-entrypoint.sh"]

# Default: single-replica mode (migrate, then start). Pass
# `migrate-only` instead (`docker run pabip-gateway migrate-only`) for the
# multi-replica job/init-container case; see `docker-entrypoint.sh` and
# `docker-compose.prod.yml.example`'s `migrate` service.
CMD []
