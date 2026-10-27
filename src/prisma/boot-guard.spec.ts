import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetConfigFileCache } from '../config/config-file.loader';
import {
  assertDatabaseUrlAllowed,
  assertSchemaVersion,
  assertShutdownGracePeriodAllowed,
  ORCH_TERMINATION_GRACE_PERIOD_ENV_VAR,
  resolveAdminPort,
  resolveApiDocsEnabled,
  resolveDatabaseUrl,
  resolveDevMode,
  resolvePublicPort,
} from './boot-guard';

const ORIGINAL_ENV = { ...process.env };

function makeMigrationsDir(names: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-migrations-'));
  for (const name of names) {
    mkdirSync(join(dir, name));
  }
  return dir;
}

describe('boot-guard', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    resetConfigFileCache();
  });

  describe('resolveDatabaseUrl', () => {
    it('returns the resolved value when DATABASE_URL is set', () => {
      process.env.DATABASE_URL = 'postgresql://user:pass@host/db';
      expect(resolveDatabaseUrl()).toBe('postgresql://user:pass@host/db');
    });

    it('throws a clear error when DATABASE_URL is missing', () => {
      delete process.env.DATABASE_URL;
      process.env.GATEWAY_CONFIG_FILE = join(tmpdir(), 'does-not-exist-12345.yaml');
      expect(() => resolveDatabaseUrl()).toThrow('Missing required config "database.url"');
    });
  });

  describe('resolvePublicPort / resolveAdminPort', () => {
    it('defaults to 8080/8081 when unset', () => {
      delete process.env.GATEWAY_PUBLIC_PORT;
      delete process.env.GATEWAY_ADMIN_PORT;
      process.env.GATEWAY_CONFIG_FILE = join(tmpdir(), 'does-not-exist-12345.yaml');
      expect(resolvePublicPort()).toBe(8080);
      expect(resolveAdminPort()).toBe(8081);
    });

    it('reads an override straight from ENV', () => {
      process.env.GATEWAY_PUBLIC_PORT = '18080';
      process.env.GATEWAY_ADMIN_PORT = '18081';
      expect(resolvePublicPort()).toBe(18080);
      expect(resolveAdminPort()).toBe(18081);
    });

    it('throws on a non-numeric override', () => {
      process.env.GATEWAY_PUBLIC_PORT = 'not-a-port';
      expect(() => resolvePublicPort()).toThrow('Expected a number');
    });

    it('throws on an out-of-range override', () => {
      process.env.GATEWAY_PUBLIC_PORT = '99999';
      expect(() => resolvePublicPort()).toThrow('Invalid or missing config "gateway.publicPort"');
    });
  });

  describe('resolveDevMode', () => {
    it('defaults to false', () => {
      delete process.env.GATEWAY_DEV_MODE;
      expect(resolveDevMode()).toBe(false);
    });

    it('reads true from ENV', () => {
      process.env.GATEWAY_DEV_MODE = 'true';
      expect(resolveDevMode()).toBe(true);
    });
  });

  describe('resolveApiDocsEnabled', () => {
    it('defaults to enabled when NODE_ENV is not production', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.GATEWAY_ENABLE_API_DOCS;
      expect(resolveApiDocsEnabled()).toBe(true);
    });

    it('defaults to disabled when NODE_ENV is production', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.GATEWAY_ENABLE_API_DOCS;
      expect(resolveApiDocsEnabled()).toBe(false);
    });

    it('allows an explicit opt-in override in production', () => {
      process.env.NODE_ENV = 'production';
      process.env.GATEWAY_ENABLE_API_DOCS = 'true';
      expect(resolveApiDocsEnabled()).toBe(true);
    });
  });

  describe('assertDatabaseUrlAllowed', () => {
    it('allows a Postgres URL regardless of devMode', () => {
      expect(() => assertDatabaseUrlAllowed('postgresql://user:pass@host/db', false)).not.toThrow();
    });

    it('allows a file: URL when devMode is true', () => {
      expect(() => assertDatabaseUrlAllowed('file:./dev.db', true)).not.toThrow();
    });

    it('rejects a file: URL when devMode is false', () => {
      expect(() => assertDatabaseUrlAllowed('file:./dev.db', false)).toThrow(
        'SQLite is not supported in production',
      );
    });
  });

  describe('assertSchemaVersion', () => {
    it('does nothing when no migrations have been authored yet', async () => {
      const dir = join(tmpdir(), 'does-not-exist-migrations-dir');
      const prisma = { $queryRaw: jest.fn() };
      await expect(assertSchemaVersion(prisma as never, dir)).resolves.toBeUndefined();
      expect(prisma.$queryRaw).not.toHaveBeenCalled();
    });

    it('passes when the applied migrations match what the binary expects', async () => {
      const dir = makeMigrationsDir(['20260101000000_init', '20260102000000_add_thing']);
      const prisma = {
        $queryRaw: jest
          .fn()
          .mockResolvedValue([
            { migration_name: '20260101000000_init' },
            { migration_name: '20260102000000_add_thing' },
          ]),
      };
      await expect(assertSchemaVersion(prisma as never, dir)).resolves.toBeUndefined();
    });

    it('throws when the schema is behind what the binary expects', async () => {
      const dir = makeMigrationsDir(['20260101000000_init', '20260102000000_add_thing']);
      const prisma = {
        $queryRaw: jest.fn().mockResolvedValue([{ migration_name: '20260101000000_init' }]),
      };
      await expect(assertSchemaVersion(prisma as never, dir)).rejects.toThrow(
        'Database schema is behind what this binary expects',
      );
    });

    it('throws when the schema is ahead of what the binary expects', async () => {
      const dir = makeMigrationsDir(['20260101000000_init']);
      const prisma = {
        $queryRaw: jest
          .fn()
          .mockResolvedValue([
            { migration_name: '20260101000000_init' },
            { migration_name: '20260102000000_add_thing' },
          ]),
      };
      await expect(assertSchemaVersion(prisma as never, dir)).rejects.toThrow(
        'Database schema is ahead of what this binary expects',
      );
    });

    it('wraps a query failure with a clearer message', async () => {
      const dir = makeMigrationsDir(['20260101000000_init']);
      const prisma = {
        $queryRaw: jest.fn().mockRejectedValue(new Error('relation does not exist')),
      };
      await expect(assertSchemaVersion(prisma as never, dir)).rejects.toThrow(
        'Could not read "_prisma_migrations"',
      );
    });
  });

  describe('assertShutdownGracePeriodAllowed', () => {
    it('does nothing when the orchestrator env var is unset', () => {
      delete process.env[ORCH_TERMINATION_GRACE_PERIOD_ENV_VAR];
      expect(() => assertShutdownGracePeriodAllowed(90)).not.toThrow();
    });

    it('does nothing when gracePeriodSeconds is within the orchestrator ceiling', () => {
      process.env[ORCH_TERMINATION_GRACE_PERIOD_ENV_VAR] = '120';
      expect(() => assertShutdownGracePeriodAllowed(90)).not.toThrow();
    });

    it('allows gracePeriodSeconds equal to the orchestrator ceiling', () => {
      process.env[ORCH_TERMINATION_GRACE_PERIOD_ENV_VAR] = '90';
      expect(() => assertShutdownGracePeriodAllowed(90)).not.toThrow();
    });

    it('throws when gracePeriodSeconds exceeds the orchestrator ceiling', () => {
      process.env[ORCH_TERMINATION_GRACE_PERIOD_ENV_VAR] = '60';
      expect(() => assertShutdownGracePeriodAllowed(90)).toThrow(
        'shutdown.gracePeriodSeconds (90s) is greater than',
      );
    });

    it('throws when the orchestrator env var is not a positive number', () => {
      process.env[ORCH_TERMINATION_GRACE_PERIOD_ENV_VAR] = 'not-a-number';
      expect(() => assertShutdownGracePeriodAllowed(90)).toThrow(
        'must be a positive number of seconds',
      );
    });
  });
});
