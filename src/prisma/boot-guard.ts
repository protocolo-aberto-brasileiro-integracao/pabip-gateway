import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { PrismaClient } from '../generated/prisma/client';
import { parseTrustedProxyCidrs } from '../common/trusted-proxy.util';
import { CONFIG_FIELDS, type ConfigFieldDefinition } from '../config/config.constants';
import { resolveField } from '../config/config-file.loader';

function requireConfigField(key: string): ConfigFieldDefinition {
  const field = CONFIG_FIELDS.find((candidate) => candidate.key === key);
  if (!field) {
    throw new Error(`boot-guard: config field definition for "${key}" is missing.`);
  }
  return field;
}

const DATABASE_URL_FIELD = requireConfigField('database.url');
const DEV_MODE_FIELD = requireConfigField('gateway.devMode');
const PUBLIC_PORT_FIELD = requireConfigField('gateway.publicPort');
const ADMIN_PORT_FIELD = requireConfigField('gateway.adminPort');
const TRUSTED_PROXY_CIDRS_FIELD = requireConfigField('gateway.trustedProxyCidrs');

export function resolveDatabaseUrl(): string {
  const resolved = resolveField(DATABASE_URL_FIELD);
  if (!resolved || typeof resolved.value !== 'string' || resolved.value.length === 0) {
    throw new Error(
      'Missing required config "database.url" — set DATABASE_URL (or DATABASE_URL_FILE) or provide it in the config file.',
    );
  }
  return resolved.value;
}

export function resolveDevMode(): boolean {
  const resolved = resolveField(DEV_MODE_FIELD);
  return resolved ? Boolean(resolved.value) : false;
}

export function resolvePublicPort(): number {
  return resolvePortField(PUBLIC_PORT_FIELD, 'gateway.publicPort');
}

export function resolveAdminPort(): number {
  return resolvePortField(ADMIN_PORT_FIELD, 'gateway.adminPort');
}

export function resolveTrustedProxyCidrs(): string[] {
  const resolved = resolveField(TRUSTED_PROXY_CIDRS_FIELD);
  const raw = resolved && typeof resolved.value === 'string' ? resolved.value : '';
  return parseTrustedProxyCidrs(raw);
}

function resolvePortField(field: ConfigFieldDefinition, key: string): number {
  const resolved = resolveField(field);
  const port = Number(resolved?.value);
  if (!resolved || !Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new Error(`Invalid or missing config "${key}" — expected an integer port number.`);
  }
  return port;
}

export function assertDatabaseUrlAllowed(databaseUrl: string, devMode: boolean): void {
  if (databaseUrl.startsWith('file:') && !devMode) {
    throw new Error(
      'SQLite is not supported in production; configure "database.url" for Postgres, ' +
        'or set gateway.devMode=true for local development/tests.',
    );
  }
}

const DEFAULT_MIGRATIONS_DIR = join(process.cwd(), 'prisma', 'migrations');

interface AppliedMigrationRow {
  migration_name: string;
}

export async function assertSchemaVersion(
  prisma: PrismaClient,
  migrationsDir: string = DEFAULT_MIGRATIONS_DIR,
): Promise<void> {
  const expected = readExpectedMigrations(migrationsDir);
  if (expected.length === 0) {
    return;
  }

  let applied: AppliedMigrationRow[];
  try {
    applied = await prisma.$queryRaw<AppliedMigrationRow[]>`
      SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY finished_at ASC
    `;
  } catch (error) {
    throw new Error(
      'Could not read "_prisma_migrations" — has "prisma migrate deploy" ever been run against this database?',
      { cause: error },
    );
  }

  const appliedNames = applied.map((row) => row.migration_name);

  const missing = expected.filter((name) => !appliedNames.includes(name));
  if (missing.length > 0) {
    throw new Error(
      `Database schema is behind what this binary expects (missing migration(s): ${missing.join(', ')}). ` +
        'Run "prisma migrate deploy" before starting this image.',
    );
  }

  const unexpected = appliedNames.filter((name) => !expected.includes(name));
  if (unexpected.length > 0) {
    throw new Error(
      'Database schema is ahead of what this binary expects ' +
        `(unrecognized migration(s): ${unexpected.join(', ')}). ` +
        'This binary is older than the currently applied schema — roll forward instead.',
    );
  }
}

function readExpectedMigrations(migrationsDir: string): string[] {
  if (!existsSync(migrationsDir)) {
    return [];
  }
  return readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export const ORCH_TERMINATION_GRACE_PERIOD_ENV_VAR = 'ORCH_TERMINATION_GRACE_PERIOD_SECONDS';

export function assertShutdownGracePeriodAllowed(gracePeriodSeconds: number): void {
  const raw = process.env[ORCH_TERMINATION_GRACE_PERIOD_ENV_VAR];
  if (raw === undefined || raw === '') {
    return;
  }

  const orchGracePeriodSeconds = Number(raw);
  if (!Number.isFinite(orchGracePeriodSeconds) || orchGracePeriodSeconds <= 0) {
    throw new Error(
      `${ORCH_TERMINATION_GRACE_PERIOD_ENV_VAR} must be a positive number of seconds when set.`,
    );
  }

  if (gracePeriodSeconds > orchGracePeriodSeconds) {
    throw new Error(
      `shutdown.gracePeriodSeconds (${gracePeriodSeconds}s) is greater than ` +
        `${ORCH_TERMINATION_GRACE_PERIOD_ENV_VAR} (${orchGracePeriodSeconds}s) — the orchestrator would ` +
        'SIGKILL this process before it finishes draining. Raise the orchestrator ' +
        'terminationGracePeriodSeconds, or lower shutdown.gracePeriodSeconds.',
    );
  }
}
