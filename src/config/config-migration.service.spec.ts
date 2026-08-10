import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { BootStatusService } from '../health/boot-status.service';
import { resetConfigFileCache } from './config-file.loader';
import { ConfigMigrationService } from './config-migration.service';
import { GATEWAY_CONFIG_RESEED_ENV_VAR } from './config.constants';

const ORIGINAL_ENV = { ...process.env };

describe('ConfigMigrationService', () => {
  let upsert: jest.Mock;
  let executeRaw: jest.Mock<Promise<number>, unknown[]>;
  let prisma: {
    gatewayConfig: { upsert: jest.Mock };
    $executeRaw: jest.Mock;
    $executeRawUnsafe: jest.Mock;
  };
  let bootStatus: BootStatusService;
  let service: ConfigMigrationService;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.GATEWAY_CONFIG_FILE = join(tmpdir(), 'does-not-exist-12345.yaml');
    resetConfigFileCache();

    upsert = jest.fn().mockResolvedValue(undefined);
    executeRaw = jest.fn<Promise<number>, unknown[]>().mockResolvedValue(0);
    prisma = {
      gatewayConfig: { upsert },
      $executeRaw: executeRaw,
      $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    };
    bootStatus = new BootStatusService();
    service = new ConfigMigrationService(prisma as never, bootStatus);

    process.env.DATABASE_URL = 'postgresql://user:pass@host/db';
    process.env.GATEWAY_ENTE_PUBLICO_NAME = 'acme';
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    resetConfigFileCache();
  });

  it('upserts every bootOnly field via the plain Prisma client', async () => {
    await service.onApplicationBootstrap();
    expect(upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { key: 'database.url' } }),
    );
  });

  it('reconciles apiWritable fields with a conditional ON CONFLICT guarding source=api', async () => {
    await service.onApplicationBootstrap();

    const loggingLevelCall = executeRaw.mock.calls.find(
      (call: unknown[]) => call[1] === 'logging.level',
    );
    expect(loggingLevelCall).toBeDefined();

    const rawSql = (loggingLevelCall as unknown[])[0] as string[];
    expect(rawSql.join('')).toContain('WHERE "gateway_config"."source" <> \'api\'');
  });

  it('drops the source=api guard when GATEWAY_CONFIG_RESEED=true', async () => {
    process.env[GATEWAY_CONFIG_RESEED_ENV_VAR] = 'true';
    await service.onApplicationBootstrap();

    const loggingLevelCall = executeRaw.mock.calls.find(
      (call: unknown[]) => call[1] === 'logging.level',
    );
    const rawSql = (loggingLevelCall as unknown[])[0] as string[];
    expect(rawSql.join('')).not.toContain('<>');
  });

  it('throws when a required bootOnly field is missing', async () => {
    delete process.env.DATABASE_URL;
    await expect(service.onApplicationBootstrap()).rejects.toThrow(
      'Missing required boot-only config field "database.url"',
    );
  });

  it('sends a single NOTIFY on the config_changed channel after reconciling', async () => {
    await service.onApplicationBootstrap();
    expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith('NOTIFY config_changed');
  });

  it('marks BootStatusService as config-migrated once reconciliation completes', async () => {
    expect(bootStatus.isConfigMigrated()).toBe(false);
    await service.onApplicationBootstrap();
    expect(bootStatus.isConfigMigrated()).toBe(true);
  });

  it('never marks BootStatusService as config-migrated when reconciliation throws', async () => {
    delete process.env.DATABASE_URL;
    await expect(service.onApplicationBootstrap()).rejects.toThrow();
    expect(bootStatus.isConfigMigrated()).toBe(false);
  });
});
