#!/bin/sh
# Runs as PID 1's child under tini (see Dockerfile's ENTRYPOINT) so SIGTERM
# reaches this script and, once `node dist/main.js` is exec'd below, the
# gateway process itself — required for the graceful shutdown drain to run
# at all on `docker stop`/a rolling deploy.
set -eu

# `prisma migrate deploy` never runs embedded in the gateway's own boot
# (`boot-guard.ts` only ever refuses to start on a schema mismatch, it
# never migrates itself, to rule out two replicas racing to apply the
# same migration). Every invocation of this image therefore runs
# it explicitly, right here, before the app process ever starts:
#
#   - Single replica: this script's default path below runs it as a
#     prefix to `node dist/main.js`, in the one container that will end up
#     serving traffic — there's no second replica to race against.
#   - Multiple replicas: run this image once, as a job/init-container,
#     with `migrate-only` as the container command. This branch below
#     applies the migration and exits 0 without ever starting `dist/main.js`
#     — the app replicas that start afterwards only ever hit `boot-guard.ts`'s
#     read-only check, never a second concurrent migration.
#
# Invoking the local binary directly (`./node_modules/.bin/prisma`) rather
# than `npx prisma` avoids `npx` needing a writable package cache under
# `--read-only` root filesystems.
./node_modules/.bin/prisma migrate deploy

if [ "${1:-}" = 'migrate-only' ]; then
  echo 'migrate-only: schema is up to date, exiting without starting the gateway process.'
  exit 0
fi

exec node dist/main.js
