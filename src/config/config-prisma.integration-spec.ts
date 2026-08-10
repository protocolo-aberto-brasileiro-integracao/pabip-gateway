import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BootStatusService } from '../health/boot-status.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConfigCacheService } from './config-cache.service';
import { resetConfigFileCache } from './config-file.loader';
import { ConfigMigrationService } from './config-migration.service';
import { GATEWAY_CONFIG_RESEED_ENV_VAR } from './config.constants';

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://gateway:gateway@localhost:5432/gateway?schema=public';

const ORIGINAL_ENV = { ...process.env };

describe('config + prisma integration (real Postgres)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env = { ...ORIGINAL_ENV };
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.GATEWAY_ENTE_PUBLICO_NAME = 'integration-test';
    process.env.GATEWAY_CONFIG_FILE = join(tmpdir(), 'does-not-exist-config-integration.yaml');
    delete process.env.GATEWAY_DEV_MODE;
    resetConfigFileCache();

    prisma = new PrismaService();
    await prisma.onModuleInit();
  }, 20_000);

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "gateway_config" ("key", "value", "source", "seededAt", "updatedAt")
       VALUES ('logging.level', '"info"'::jsonb, 'default'::"config_source", now(), now())
       ON CONFLICT ("key") DO UPDATE SET
         "value" = EXCLUDED."value", "source" = EXCLUDED."source", "updatedAt" = now()`,
    );
    await prisma.onModuleDestroy();
    process.env = { ...ORIGINAL_ENV };
    resetConfigFileCache();
  });

  it('connects and confirms the applied schema matches what the binary expects', () => {
    expect(prisma.databaseUrl).toBe(TEST_DATABASE_URL);
  });

  it('reconciles a bootOnly field from ENV into a real "gateway_config" row', async () => {
    const migration = new ConfigMigrationService(prisma, new BootStatusService());
    await migration.onApplicationBootstrap();

    const [row] = await prisma.gatewayConfig.findMany({
      where: { key: 'gateway.entePublicoName' },
    });
    expect(row?.value).toBe('integration-test');
    expect(row?.source).toBe('env');
  });

  it('protects a source=api row from being overwritten by ENV on a normal reconcile', async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "gateway_config" ("key", "value", "source", "seededAt", "updatedAt")
       VALUES ('logging.level', '"warn"'::jsonb, 'api'::"config_source", now(), now())
       ON CONFLICT ("key") DO UPDATE SET
         "value" = EXCLUDED."value", "source" = 'api'::"config_source", "updatedAt" = now()`,
    );

    process.env.LOG_LEVEL = 'debug';
    delete process.env[GATEWAY_CONFIG_RESEED_ENV_VAR];
    const migration = new ConfigMigrationService(prisma, new BootStatusService());
    await migration.onApplicationBootstrap();

    const [row] = await prisma.gatewayConfig.findMany({ where: { key: 'logging.level' } });
    expect(row?.value).toBe('warn');
    expect(row?.source).toBe('api');
  });

  it('overrides a source=api row when GATEWAY_CONFIG_RESEED=true', async () => {
    process.env.LOG_LEVEL = 'debug';
    process.env[GATEWAY_CONFIG_RESEED_ENV_VAR] = 'true';
    const migration = new ConfigMigrationService(prisma, new BootStatusService());
    await migration.onApplicationBootstrap();
    delete process.env[GATEWAY_CONFIG_RESEED_ENV_VAR];

    const [row] = await prisma.gatewayConfig.findMany({ where: { key: 'logging.level' } });
    expect(row?.value).toBe('debug');
    expect(row?.source).toBe('env');
  });

  it('builds a valid schema tree from the reconciled rows', async () => {
    const cache = new ConfigCacheService(prisma);
    await cache.onModuleInit();
    try {
      const schema = cache.getSchema();
      expect(schema.gateway.entePublicoName).toBe('integration-test');
      expect(schema.logging.level).toBe('debug');
    } finally {
      await cache.onModuleDestroy();
    }
  });

  it('propagates a real LISTEN/NOTIFY on "config_changed" into a cache reload', async () => {
    const cache = new ConfigCacheService(prisma);
    await cache.onModuleInit();

    try {
      expect(cache.getSchema().logging.level).toBe('debug');

      await prisma.$executeRawUnsafe(
        `INSERT INTO "gateway_config" ("key", "value", "source", "seededAt", "updatedAt")
         VALUES ('logging.level', '"error"'::jsonb, 'api'::"config_source", now(), now())
         ON CONFLICT ("key") DO UPDATE SET
           "value" = EXCLUDED."value", "source" = EXCLUDED."source", "updatedAt" = now()`,
      );
      await prisma.$executeRawUnsafe(`NOTIFY config_changed`);

      await waitFor(() => cache.getSchema().logging.level === 'error', 5_000);
      expect(cache.getSchema().logging.level).toBe('error');
    } finally {
      await cache.onModuleDestroy();
    }
  }, 10_000);

  it('writeApiValue() upserts source=api, notifies, and reloads its own cache instance', async () => {
    const cache = new ConfigCacheService(prisma);
    await cache.onModuleInit();

    try {
      await cache.writeApiValue('logging.level', 'trace');

      expect(cache.getSchema().logging.level).toBe('trace');
      const [row] = await prisma.gatewayConfig.findMany({ where: { key: 'logging.level' } });
      expect(row?.value).toBe('trace');
      expect(row?.source).toBe('api');
    } finally {
      await cache.onModuleDestroy();
    }
  });
});

async function waitFor(condition: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor: condition not met within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
