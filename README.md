# pabip-gateway

Reference implementation of a PABIP gateway: a self-hosted bridge between
image-analytics event producers (sensor nodes) and consumers (police
integration systems, callbacks, queues, or databases).

[`cli/`](./cli) ships `pabip-gatewayctl`, a headless command-line client of
the gateway's own `admin-api` — peers, admin tokens, and config, from a
terminal or a script.

See [`OPERATIONS.md`](./OPERATIONS.md) for deployment and configuration
guidance, and [`CONTRIBUTING.md`](./CONTRIBUTING.md) for local development.

## Status

Under active development. Architecture and module boundaries are tracked
per pull request.
