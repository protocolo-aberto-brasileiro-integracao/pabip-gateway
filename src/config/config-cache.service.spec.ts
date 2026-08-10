import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DbChangeNotifier } from '../common/db-change-notifier';
import { ConfigCacheService } from './config-cache.service';
import { CONFIG_FIELDS } from './config.constants';
import { resetConfigFileCache } from './config-file.loader';

jest.mock('../common/db-change-notifier');

const ORIGINAL_ENV = { ...process.env };

const MockedDbChangeNotifier = DbChangeNotifier as jest.MockedClass<typeof DbChangeNotifier>;

const REQUIRED_OVERRIDES: Record<string, unknown> = {
  'database.url': 'postgresql://user:pass@host/db',
  'gateway.entePublicoName': 'acme',
};

function buildValidRows(): { key: string; value: unknown }[] {
  return CONFIG_FIELDS.map((field) => ({
    key: field.key,
    value: field.key in REQUIRED_OVERRIDES ? REQUIRED_OVERRIDES[field.key] : field.default,
  }));
}

describe('ConfigCacheService', () => {
  let findMany: jest.Mock;
  let upsert: jest.Mock;
  let executeRawUnsafe: jest.Mock;
  let prisma: {
    gatewayConfig: { findMany: jest.Mock; upsert: jest.Mock };
    databaseUrl: string;
    $executeRawUnsafe: jest.Mock;
  };
  let service: ConfigCacheService;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.GATEWAY_CONFIG_FILE = join(tmpdir(), 'does-not-exist-config-cache.yaml');
    resetConfigFileCache();

    MockedDbChangeNotifier.mockClear();
    findMany = jest.fn().mockResolvedValue(buildValidRows());
    upsert = jest.fn().mockResolvedValue(undefined);
    executeRawUnsafe = jest.fn().mockResolvedValue(0);
    prisma = {
      gatewayConfig: { findMany, upsert },
      databaseUrl: 'postgresql://user:pass@host/db',
      $executeRawUnsafe: executeRawUnsafe,
    };
    service = new ConfigCacheService(prisma as never);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    resetConfigFileCache();
  });

  it('throws if getSchema() is called before the first reload', () => {
    expect(() => service.getSchema()).toThrow('called before the first reload completed');
  });

  it('builds and validates the schema from gateway_config rows on init', async () => {
    await service.onModuleInit();

    const schema = service.getSchema();
    expect(schema.database.url).toBe('postgresql://user:pass@host/db');
    expect(schema.gateway.entePublicoName).toBe('acme');
    expect(schema.output.type).toBe('callback');
    expect(schema.retry.maxAttempts).toBe(5);
  });

  it('starts a DbChangeNotifier on the config_changed channel with the poll interval', async () => {
    await service.onModuleInit();

    expect(MockedDbChangeNotifier).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'config_changed',
        connectionString: prisma.databaseUrl,
        pollIntervalMs: 5_000,
      }),
    );
    const notifierInstance = MockedDbChangeNotifier.mock.instances[0] as unknown as {
      start: jest.Mock;
    };
    expect(notifierInstance.start).toHaveBeenCalled();
  });

  it('reloads the schema when the notifier reports a change', async () => {
    await service.onModuleInit();
    findMany.mockResolvedValue(
      buildValidRows().map((row) =>
        row.key === 'logging.level' ? { ...row, value: 'debug' } : row,
      ),
    );

    const onChange = MockedDbChangeNotifier.mock.calls[0][0].onChange;
    await onChange();

    expect(service.getSchema().logging.level).toBe('debug');
  });

  it('throws a descriptive error when the reconciled config fails validation', async () => {
    findMany.mockResolvedValue(
      buildValidRows().filter((row) => row.key !== 'gateway.entePublicoName'),
    );

    await expect(service.onModuleInit()).rejects.toThrow('Invalid gateway configuration');
  });

  it('stops the notifier on destroy', async () => {
    await service.onModuleInit();
    await service.onModuleDestroy();

    const notifierInstance = MockedDbChangeNotifier.mock.instances[0] as unknown as {
      stop: jest.Mock;
    };
    expect(notifierInstance.stop).toHaveBeenCalled();
  });

  describe('writeApiValue', () => {
    it('upserts the row with source=api, notifies, and reloads the in-memory schema', async () => {
      await service.onModuleInit();
      findMany.mockResolvedValue(
        buildValidRows().map((row) =>
          row.key === 'logging.level' ? { ...row, value: 'debug' } : row,
        ),
      );

      await service.writeApiValue('logging.level', 'debug');

      expect(upsert).toHaveBeenCalledWith({
        where: { key: 'logging.level' },
        create: { key: 'logging.level', value: 'debug', source: 'api' },
        update: { value: 'debug', source: 'api' },
      });
      expect(executeRawUnsafe).toHaveBeenCalledWith('NOTIFY config_changed');
      expect(service.getSchema().logging.level).toBe('debug');
    });
  });
});
