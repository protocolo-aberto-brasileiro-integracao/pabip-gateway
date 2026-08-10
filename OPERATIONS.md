# Operations guide

This document is for whoever runs a `pabip-gateway` instance in production —
the infra/SRE side of an adopting organization (an Ente Privado or a
third party running their own fork). If you're contributing *code* to
this repository instead, see [`CONTRIBUTING.md`](./CONTRIBUTING.md).

This document assumes PABIP's own vocabulary (Ente Privado, admin-api,
`gateway_config`) without re-explaining it, and only covers the decisions
an operator needs to *act on*, not the reasoning behind them.

## Contents

- [Environment variables](#environment-variables)
- [Infrastructure requirements](#infrastructure-requirements)
- [Network model, in one paragraph](#network-model-in-one-paragraph)
- [Postgres backup and restore](#postgres-backup-and-restore)
- [AdminToken rotation procedure](#admintoken-rotation-procedure)
- [First-boot checklist](#first-boot-checklist)
- [Schema migrations across an upgrade](#schema-migrations-across-an-upgrade)
- [Health checks and graceful shutdown](#health-checks-and-graceful-shutdown)

## Environment variables

This table mirrors `src/config/config.constants.ts` field for field — that
file is the single source of truth if the two ever disagree. Every field
resolves as **Admin API > ENV > config file > built-in default**; this table
only covers the ENV leg (see `.env.example`, which lists the same
information as a copy-pasteable starting point, and `gateway.config.yaml`
if you prefer a file over ENV for the boot-only fields).

**Boot-only** fields are read once, at process start, from ENV/the config
file — they are never accepted through `admin-api`, and changing one always
requires a restart of every replica. **Runtime-writable** fields can also be
changed after boot through `PATCH /admin/config` (or `pabip-gatewayctl
config set`), without a restart. **Sensitive** fields (marked below) also
accept the `<VAR>_FILE` convention — set `DATABASE_URL_FILE=/run/secrets/db-url`
instead of `DATABASE_URL` and the value is read from that file at boot,
so the secret itself never has to appear in `docker inspect`/`ps`/an
environment dump.

| ENV var | Config key | Kind | Default | Notes |
|---|---|---|---|---|
| `DATABASE_URL` | `database.url` | boot-only, **sensitive** | — (required) | Postgres/MySQL connection string for the gateway's own registry (peers, admin tokens, `gateway_config`, audit log if `audit.sink=db`). `file:...` is only accepted with `GATEWAY_DEV_MODE=true` — never in production. |
| `GATEWAY_DEV_MODE` | `gateway.devMode` | boot-only | `false` | Allows `DATABASE_URL` to point at SQLite. Local/test only — the boot guard refuses SQLite otherwise. |
| `GATEWAY_ENTE_PUBLICO_NAME` | `gateway.entePublicoName` | boot-only | — (required) | Identity of the operator running this instance, fixed at install time. Boot refuses to finish without it. |
| `GATEWAY_TLS_CERT_PATH` | `gateway.tls.certPath` | boot-only | `""` | Path to a TLS certificate for the public webhook listener. Leave unset if TLS terminates in a reverse proxy in front of the container (the usual production shape — see `docker-compose.prod.yml.example`). |
| `GATEWAY_TLS_KEY_PATH` | `gateway.tls.keyPath` | boot-only | `""` | Paired private key for `GATEWAY_TLS_CERT_PATH`. |
| `GATEWAY_PUBLIC_PORT` | `gateway.publicPort` | boot-only | `8080` | Public webhook listener (`POST /image-analytics/events`) and `/peers/*` (PABIP passthrough — sensor-nodes, video-playback, image-analytics-detail — for a frontend or another consuming system, `X-Client-Token`). Reachable from the internet by design — see network model below. |
| `GATEWAY_ADMIN_PORT` | `gateway.adminPort` | boot-only | `8081` | Admin/`admin-api` listener (peer registration, tokens, `gateway_config` — the surfaces that alter the gateway's own configuration), plus `/healthz`, `/readyz`, `/metrics`. **Never** exposed outside the operator's private network. |
| `GATEWAY_TRUSTED_PROXY_CIDRS` | `gateway.trustedProxyCidrs` | boot-only | `""` | Comma-separated CIDR/IP list of the reverse proxy(ies) trusted to set `X-Forwarded-For` (`app.set('trust proxy', ...)`). Empty keeps the fixed 1-hop trust that already matches this repo's reference single-reverse-proxy topology; set this for more than one proxy in front, or to scope trust to specific proxy addresses. |
| `GATEWAY_ADMIN_TOKENS` | *(not a `gateway_config` row — seeded directly into `AdminToken`)* | seed-only | — | Comma-separated admin token(s), read once on a genuinely first boot (no admin token exists yet in the database). Every boot after that, this variable is ignored — token management moves entirely to `admin-api`/`pabip-gatewayctl`. See [AdminToken rotation](#admintoken-rotation-procedure). |
| `GATEWAY_CONFIG_FILE` | *(loader path, not a row itself)* | boot-only | `gateway.config.yaml` | Path to the YAML file that seeds file-sourced config. A missing file is fine — every field just falls through to ENV/default. |
| `GATEWAY_CONFIG_RESEED` | *(one-boot override flag)* | boot-only | `false` | Forces file/ENV to win again over a value already set via `admin-api`, for one boot only. An explicit, occasional operator action — never leave this set long-term. |
| `DELIVERY_MAX_CONCURRENT_PER_PEER` | `delivery.maxConcurrentPerPeer` | runtime-writable | `20` | Outbound delivery concurrency cap, per peer. |
| `DELIVERY_MAX_ATTEMPTS` | `delivery.maxAttempts` | runtime-writable | `3` | Delivery attempts before a batch is recorded `delivery_failed`. |
| `DELIVERY_WINDOW_SECONDS` | `delivery.windowSeconds` | runtime-writable | `60` | Dedupe/redelivery window for inbound batches. |
| `SHUTDOWN_GRACE_PERIOD_SECONDS` | `shutdown.gracePeriodSeconds` | runtime-writable | `90` | How long a `SIGTERM`'d replica keeps draining in-flight deliveries before giving up. Must stay at or below your orchestrator's own termination grace period — see `ORCH_TERMINATION_GRACE_PERIOD_SECONDS` below and [Health checks and graceful shutdown](#health-checks-and-graceful-shutdown). |
| `OUTPUT_TYPE` | `output.type` | runtime-writable | `callback` | `callback` \| `queue` \| `db` — which output-sink driver delivers analytics to the consumer. |
| `OUTPUT_CALLBACK_URL` | `output.callback.url` | runtime-writable | `""` | Required if `OUTPUT_TYPE=callback`. |
| `OUTPUT_CALLBACK_HEADERS` | `output.callback.headers` | runtime-writable | `{}` | JSON object of extra headers sent with each callback (e.g. a shared secret header your receiver expects). |
| `OUTPUT_QUEUE_ROUTING_KEY_TEMPLATE` | `output.queue.routingKeyTemplate` | runtime-writable | `pabip.events.{peerId}.{batchType}` | Used if `OUTPUT_TYPE=queue`. |
| `OUTPUT_QUEUE_BROKER_URL` | `output.queue.brokerUrl` | boot-only, **sensitive** | `""` | Broker connection string if `OUTPUT_TYPE=queue` (RabbitMQ/Kafka/SQS/Redis Streams — see `src/output-sink/drivers`). |
| `OUTPUT_DB_CONNECTION_STRING` | `output.db.connectionString` | boot-only, **sensitive** | `""` | Destination database connection string if `OUTPUT_TYPE=db` — this is the *consumer's* database, never `DATABASE_URL` (the gateway's own registry). See `prisma/output-sink/schema.prisma` for the table contract your destination database must already have before switching to this driver. |
| `LOG_LEVEL` | `logging.level` | runtime-writable | `info` | pino level: `trace` \| `debug` \| `info` \| `warn` \| `error` \| `fatal` \| `silent`. |
| `CIRCUIT_BREAKER_ERROR_THRESHOLD` | `circuitBreaker.errorThreshold` | runtime-writable | `0.5` | Error ratio (0–1) that opens the per-peer circuit breaker. |
| `CIRCUIT_BREAKER_WINDOW_SECONDS` | `circuitBreaker.windowSeconds` | runtime-writable | `30` | Rolling window the error ratio above is computed over. |
| `RETRY_MAX_ATTEMPTS` | `retry.maxAttempts` | runtime-writable | `5` | Outbound HTTP retry attempts (peer consumption calls, callback delivery). |
| `RETRY_BASE_DELAY_MS` | `retry.baseDelayMs` | runtime-writable | `500` | Base delay for the retry backoff. |
| `RETRY_JITTER_PCT` | `retry.jitterPct` | runtime-writable | `20` | Jitter percentage applied on top of the backoff delay. |
| `AUDIT_SINK` | `audit.sink` | runtime-writable | `stdout` | `stdout` \| `db`. |
| `AUDIT_RETENTION_DAYS` | `audit.retentionDays` | runtime-writable | `180` | Normative floor is 180 days regardless of sink — don't set this lower. |
| `PEER_ONBOARDING_VALIDATION_TIMEOUT_MS` | `peerOnboarding.onboardingValidationTimeoutMs` | runtime-writable | `5000` | Timeout for validating a new peer's manifest during `POST /admin/peers`. |
| `ORCH_TERMINATION_GRACE_PERIOD_SECONDS` | *(not a config row — a cross-check only)* | — | unset | If your orchestrator's own termination grace period is fixed and known (Kubernetes `terminationGracePeriodSeconds`, an ECS stop timeout, ...), set it here too. Boot refuses to start if it's shorter than `shutdown.gracePeriodSeconds`, since the orchestrator would `SIGKILL` mid-drain otherwise. |
| `NODE_ENV` | *(framework-level, not a `gateway_config` row)* | — | unset | Set to `production` in every real deployment — switches pino to plain structured JSON lines instead of the pretty-printed dev format. |

Fields not listed in `.env.example` at all (`peer.*`, and the one-time
`GATEWAY_ADMIN_TOKENS` seed) are documented above and in that file's own
comments — they don't fit the regular `gateway_config` row shape (see
`config.constants.ts`'s header comment for why).

## Infrastructure requirements

- **Compute**: one container per replica, stateless — the container holds
  no durable state of its own; everything that matters lives in Postgres.
  Size for your own ingestion volume; there's no gateway-specific
  CPU/memory floor beyond what Node itself needs.
- **Database**: Postgres (or MySQL — Prisma's `datasource` supports either,
  though this repo's own `schema.prisma` is pinned to `postgresql`; adjust
  if you fork for MySQL). Provisioned, backed up, and monitored the same
  way you already run any other production database — the gateway
  introduces no database of its own, see
  [Postgres backup and restore](#postgres-backup-and-restore). SQLite
  (`GATEWAY_DEV_MODE=true`) is dev/test-only and unsupported in production.
- **Network**: see below — the public webhook port and the admin port have
  fundamentally different exposure requirements, never put them behind the
  same listener or the same network boundary.
- **TLS**: terminate at a reverse proxy/load balancer/ingress in front of
  the public webhook port (`docker-compose.prod.yml.example` shows a
  minimal Caddy example) rather than inside the gateway process, unless
  your environment specifically requires in-process TLS
  (`GATEWAY_TLS_CERT_PATH`/`GATEWAY_TLS_KEY_PATH` exist for that case).
- **Log collection**: the gateway never writes logs to disk, only stdout —
  point your usual collector (Loki, CloudWatch, ELK, journald, ...) at the
  container's stdout. If `audit.sink=stdout` (the default), that collector
  is also your audit trail retention mechanism — the 180-day floor
  (`AUDIT_RETENTION_DAYS`) has to be enforced there, the gateway itself
  never stores a second copy.
- **Hosting platform**: this repo doesn't prescribe one — any environment
  that can run a Docker container with the two network surfaces described
  below works. Coordinate the actual choice (cloud, on-prem, which
  provider) with your own infrastructure team.

## Network model, in one paragraph

Two surfaces, radically different exposure: the public listener (`gateway.publicPort`, default 8080) **must** be reachable
from the internet, and carries two independent things — the webhook
(`POST /image-analytics/events`, `X-API-Key` + IP allowlist, for partner
Entes Privados) and `/peers/*` (PABIP passthrough — sensor-nodes,
video-playback, image-analytics-detail — `X-Client-Token` + its own IP
allowlist + a dedicated rate-limiter bucket, `PeersAccessGuard`, for a
frontend or another consuming system). An `X-Admin-Token` also works on
`/peers/*` (superset), but isn't subject to that IP allowlist/rate limit —
it already has unrestricted access via `/admin/*` regardless. The admin
surface (`gateway.adminPort`, default 8081 — `admin-api`'s config-changing
routes: peer registration, tokens, `gateway_config`, plus `/healthz`,
`/readyz`, `/metrics`) must **never** be reachable from the internet, full
stop — private network (VPN, an isolated VPC subnet, or a LAN with no route
out) plus `X-Admin-Token` as a second, independent layer. Don't put both
ports behind the same load balancer or security group; `docker-compose.prod.yml.example`
only ever exposes the public port through its reverse proxy, and the admin
port isn't published to the host at all — reach it via `docker exec` into a
replica, a bastion host on the same private network, or a VPN client, then
run `pabip-gatewayctl` from there.

## Postgres backup and restore

Only two things in the whole gateway are worth protecting, and they're both
in Postgres: the **peer registry** (names, hashed keys, scopes) and the
**audit log**, if `audit.sink=db`. Analytics payloads themselves are never persisted by design — there is no
"data in transit" to back up, because it never touches disk on the
gateway side.

**Backup.** Delegate entirely to whatever tooling you already run against
any other production Postgres you operate — `pg_dump`/`pg_basebackup`, or
your managed provider's own backup mechanism (RDS/Cloud SQL snapshots,
etc.). The gateway doesn't introduce a bespoke backup mechanism of its own,
because the database is already external and already under the same
operational discipline as the rest of your infrastructure. A reasonable
starting cadence: a nightly `pg_dump` plus continuous WAL archiving/PITR if
your Postgres provider supports it, same as any other OLTP database holding
data you'd regret losing.

**Restore.** Restore the dump into the external database (or point
`DATABASE_URL` at an already-restored one) — no replica needs special
handling, since every replica talks to the same connection string. There is
no "partial restore"/"replay lost events" scenario to plan for: the one
state that matters (the peer registry) changes rarely, by human action, and
whatever wasn't delivered before a disaster is already accounted for as
`delivery_failed`/`delivery_interrupted` in the audit trail, not as
something recoverable from a backup.

**After a restore**, before traffic resumes:

1. Point `DATABASE_URL` (or `DATABASE_URL_FILE`) at the restored database.
2. Start exactly one instance of the image with the `migrate-only` command
   (`docker run ... pabip-gateway migrate-only`) to confirm the schema
   version matches what this binary expects — `boot-guard.ts` refuses to
   start a real replica otherwise, so this is a cheap way to fail fast if
   the restore is from an older/newer schema than the image you're running.
3. Bring replicas back up normally.

## AdminToken rotation procedure

The admin surface accepts **any number of simultaneously valid tokens**, on
purpose — rotation is a two-step, zero-downtime operation, never a single
shared secret you swap under load:

1. **Issue a new token** without touching the old one:
   ```
   pabip-gatewayctl --admin-url https://admin.internal:8081 --token <existing-token> \
     tokens issue --label "2026-q3-rotation"
   ```
   This prints the plaintext token exactly once — store it in your secret
   manager immediately, it's never retrievable again afterwards
   (`GET /admin/tokens` only ever returns id/label/createdAt).
2. **Roll the new token out** to every consumer of the admin surface
   (`pabip-admin`, `pabip-gatewayctl` invocations in scripts/cron, any
   legacy integration) at your own pace — the old token keeps authenticating
   the whole time, there's no cutover window to coordinate.
3. **Confirm nothing still uses the old token** — check your own
   deployment tooling/secret manager for remaining references, or simply
   wait through a full deploy cycle of every consumer.
4. **Revoke the old token**:
   ```
   pabip-gatewayctl --admin-url https://admin.internal:8081 --token <new-token> \
     tokens revoke <old-token-id>
   ```
   (`tokens list` shows the `id` for a given `label`/`createdAt` if you
   didn't record it at issuance time.)

Rotate on whatever cadence your own security policy requires, and
immediately (steps 1–4, same procedure) any time a token might have leaked
— logged accidentally, shared over an insecure channel, or held by someone
who's left the team with no other way to have their access revoked
individually (`admin-api` has no per-user identity, only per-token — a
deliberate scope boundary, not an oversight).

## ClientToken (`/peers/*`) issuance

Same rotation-with-overlap shape as above (`client-tokens issue` →
roll out → `client-tokens revoke <old-id>`), through
`/admin/client-tokens` instead of `/admin/tokens` — but this is the one
credential meant to be handed to something other than an operator (a
frontend, another consuming system), on the public listener:

```
pabip-gatewayctl --admin-url https://admin.internal:8081 --token <admin-token> \
  client-tokens issue --label "frontend-prod" --ip-allowlist 203.0.113.5
```

Always set `--ip-allowlist` for a token that's going to a known, fixed
caller (a backend-for-frontend, a server-to-server integration) — an empty
allowlist means unrestricted, which is only appropriate for a token handed
to something with no stable egress IP of its own (a browser-based
frontend calling `/peers/*` directly, for instance). The rate limit
(`rate-limiter.constants.ts`'s `PEERS_ACCESS_RATE_LIMITER_QUOTA`, currently
60 req/s per token) applies regardless of the allowlist.

## First-boot checklist

Before the very first `docker run`/`docker compose up` against a fresh
database:

- [ ] `DATABASE_URL` points at a reachable Postgres, and `GATEWAY_DEV_MODE`
      is unset/`false` (SQLite is never valid here).
- [ ] `GATEWAY_ENTE_PUBLICO_NAME` is set to a real, final value — this is
      fixed at install time, changing it later means updating every
      partner integration that keys off it.
- [ ] `GATEWAY_ADMIN_TOKENS` has at least one token, generated with a real
      random-secret generator (not a placeholder value) — boot refuses to
      finish if this is empty *and* no admin token already exists in the
      database (fail-closed). Store the value in
      your secret manager immediately; it's a seed, not something you keep
      setting on every boot (see the [rotation procedure](#admintoken-rotation-procedure)
      once you're past first boot).
- [ ] `OUTPUT_TYPE` and its matching `OUTPUT_*` settings are configured for
      wherever this instance actually delivers analytics — the default
      (`callback`, empty URL) will reject every delivery attempt until
      `OUTPUT_CALLBACK_URL` is set, so this is worth confirming even though
      boot itself doesn't require it.
- [ ] The admin port (`gateway.adminPort`) is *not* reachable from outside
      your private network — verify this from outside before considering
      the instance live, not just from configuration review (see
      [network model](#network-model-in-one-paragraph)).
- [ ] Run the image once with `migrate-only` before starting any real
      replica, even on a genuinely empty database — this both applies the
      initial schema and confirms the migration step itself works in your
      environment before it's on the critical path of a real rolling
      deploy.
- [ ] After the first replica is up, confirm both probes:
      `pabip-gatewayctl --admin-url <url> health check` should report
      `"status": "ok"` for both `healthz` and `readyz`.
- [ ] Your log collector is receiving stdout from the container — this is
      the only place logs (and, if `audit.sink=stdout`, the audit trail)
      exist at all.

## Schema migrations across an upgrade

Never embedded in a replica's own boot — every
image invocation runs `prisma migrate deploy` explicitly, either as a
prefix to the app process (single replica, the default `CMD`) or as the
sole action when the container is run with `migrate-only` (multi-replica:
run this once, as a job/init-container, before any app replica of the new
image starts — see `docker-entrypoint.sh` and the `migrate` service in
`docker-compose.prod.yml.example`). `boot-guard.ts` is the safety net behind
that: every replica, on boot, compares the migrations it expects against
what's actually applied, and refuses to start — crash-looping, not
self-correcting — if the schema is behind (run the migration first) or
ahead (this binary is older than the schema; roll forward instead).

## Health checks and graceful shutdown

- `GET /healthz` (liveness) — event loop only, never a dependency. A
  container that fails this is genuinely wedged; restarting it is always
  correct.
- `GET /readyz` (readiness) — config reconciled, peer registry loaded, and
  not currently draining for shutdown. Point your orchestrator's readiness
  probe here so traffic stops routing to a replica the instant it starts
  draining, without waiting for the socket to actually close.
- On `SIGTERM` (`docker stop`, a rolling replace, a Kubernetes pod
  eviction), the process flips readiness immediately, then keeps serving
  in-flight *and new* requests normally for up to
  `shutdown.gracePeriodSeconds` (default 90s) while in-flight deliveries
  drain, then closes its sockets and exits. Whatever is still in flight
  past that ceiling is recorded as `delivery_interrupted` in the audit
  trail rather than silently dropped.
- Set your orchestrator's own termination grace period to at least
  `shutdown.gracePeriodSeconds`, and consider also setting
  `ORCH_TERMINATION_GRACE_PERIOD_SECONDS` to the same value — boot refuses
  to start if the two are inconsistent, catching a misconfiguration before
  it causes a `SIGKILL` mid-drain during a real deploy instead of during
  review.
