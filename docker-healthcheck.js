'use strict';

/**
 * Backs the Dockerfile's `HEALTHCHECK` — a plain Node script rather than
 * `curl`/`wget` so the runtime image doesn't need either installed just for
 * this one probe. Hits `/healthz` (liveness only — never a
 * dependency check) on the admin listener, since that's the port this
 * process itself always knows (`GATEWAY_ADMIN_PORT`, matching
 * `config.constants.ts`'s default of 8081 when unset).
 */
const http = require('node:http');

const port = Number(process.env.GATEWAY_ADMIN_PORT) || 8081;

const request = http.get({ host: '127.0.0.1', port, path: '/healthz', timeout: 2000 }, (response) => {
  const healthy = response.statusCode !== undefined && response.statusCode >= 200 && response.statusCode < 300;
  process.exit(healthy ? 0 : 1);
});

request.on('error', () => process.exit(1));
request.on('timeout', () => {
  request.destroy();
  process.exit(1);
});
