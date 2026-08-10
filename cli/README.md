# pabip-gatewayctl

A headless command-line client for a `pabip-gateway` instance's `admin-api`
— peers, admin tokens, and config, from a terminal or a script. It
carries no logic of its own: every command shapes one
authenticated HTTP call and prints back admin-api's own JSON response.

`admin-api` is only ever reachable from the gateway operator's private
network (see the root [`OPERATIONS.md`](../OPERATIONS.md)) — run this from
a host that already has a route there (a bastion, a VPN client, or
`docker exec` into a running gateway container, which already has
`pabip-gatewayctl` on its `PATH`).

## Install / build

This package is an npm workspace of the repo root — `npm install` at the
repo root installs it too.

```
npm run build:cli          # from the repo root, or:
npm run build --workspace=cli
node cli/dist/main.js --help
```

## Usage

```
pabip-gatewayctl --admin-url http://localhost:8081 --token <admin-token> <command>
```

`--admin-url`/`--token` can also come from `GATEWAY_ADMIN_URL`/
`GATEWAY_ADMIN_TOKEN` (or `--token-file`/`GATEWAY_ADMIN_TOKEN_FILE` for the
token, mirroring the `<VAR>_FILE` secret-file convention the gateway itself
uses — see `config-file.loader.ts`).

```
pabip-gatewayctl peers list
pabip-gatewayctl peers create --name partner-1 --base-url https://partner.example.com \
  --their-api-key <key-partner-gave-you> --scope plate:write face:write
pabip-gatewayctl peers rotate-key <peer-id>

pabip-gatewayctl tokens issue --label "ops-laptop"
pabip-gatewayctl tokens revoke <token-id>

pabip-gatewayctl config get
pabip-gatewayctl config set delivery.maxAttempts=5 output.type=callback

pabip-gatewayctl health check

pabip-gatewayctl passthrough sensor-nodes --peer <peer-id>
pabip-gatewayctl passthrough video-session <node-id> --peer <peer-id>
```

Every command prints its result as pretty JSON on success (pipe into `jq`
for scripting) and a one-line error to stderr with a non-zero exit code on
failure.

## Development

See the root [`CONTRIBUTING.md`](../CONTRIBUTING.md) — `npm run
lint:cli`/`test:cli`/`build:cli` from the repo root, or the equivalent
`npm run lint`/`test`/`build` from inside `cli/` directly.
