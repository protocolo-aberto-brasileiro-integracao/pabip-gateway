import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PrismaService } from '../prisma/prisma.service';
import { resetConfigFileCache } from '../config/config-file.loader';
import { AdminTokenService } from '../auth/admin-token.service';
import { PeerCacheService } from './peer-cache.service';

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://gateway:gateway@localhost:5432/gateway?schema=public';

const ORIGINAL_ENV = { ...process.env };

describe('peers + auth Prisma integration (real Postgres)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env = { ...ORIGINAL_ENV };
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.GATEWAY_CONFIG_FILE = join(tmpdir(), 'does-not-exist-peers-integration.yaml');
    delete process.env.GATEWAY_DEV_MODE;
    resetConfigFileCache();

    prisma = new PrismaService();
    await prisma.onModuleInit();
  }, 20_000);

  afterAll(async () => {
    await prisma.onModuleDestroy();
    process.env = { ...ORIGINAL_ENV };
    resetConfigFileCache();
  });

  afterEach(async () => {
    await prisma.peer.deleteMany({ where: { name: { startsWith: 'integration-test-' } } });
    await prisma.adminToken.deleteMany({ where: { label: 'integration-test' } });
  });

  it('inserts a peer and reads it back through the real client', async () => {
    const created = await prisma.peer.create({
      data: {
        name: 'integration-test-acme',
        baseUrl: 'https://acme.example',
        theirApiKey: 'their-key',
        apiKeyHash: 'hash-integration-1',
        scopes: ['plate:write'],
        ipAllowlist: [],
        capabilities: ['plate'],
      },
    });

    const [found] = await prisma.peer.findMany({ where: { id: created.id } });
    expect(found?.name).toBe('integration-test-acme');
  });

  it('rejects a second peer with the same apiKeyHash (UNIQUE constraint)', async () => {
    await prisma.peer.create({
      data: {
        name: 'integration-test-first',
        baseUrl: 'https://first.example',
        theirApiKey: 'k1',
        apiKeyHash: 'hash-integration-conflict',
        scopes: ['plate:write'],
        ipAllowlist: [],
        capabilities: [],
      },
    });

    await expect(
      prisma.peer.create({
        data: {
          name: 'integration-test-second',
          baseUrl: 'https://second.example',
          theirApiKey: 'k2',
          apiKeyHash: 'hash-integration-conflict',
          scopes: ['plate:write'],
          ipAllowlist: [],
          capabilities: [],
        },
      }),
    ).rejects.toThrow();
  });

  it('propagates a real LISTEN/NOTIFY on "peers_changed" into a cache reload', async () => {
    const cache = new PeerCacheService(prisma);
    await cache.onModuleInit();

    try {
      expect(cache.getById('does-not-exist-yet')).toBeUndefined();

      const created = await prisma.peer.create({
        data: {
          name: 'integration-test-notify',
          baseUrl: 'https://notify.example',
          theirApiKey: 'k-notify',
          apiKeyHash: 'hash-integration-notify',
          scopes: ['face:write'],
          ipAllowlist: [],
          capabilities: ['face'],
        },
      });
      await prisma.$executeRawUnsafe(`NOTIFY peers_changed`);

      await waitFor(() => cache.getById(created.id) !== undefined, 5_000);
      expect(cache.getByApiKeyHash('hash-integration-notify')?.id).toBe(created.id);
    } finally {
      await cache.onModuleDestroy();
    }
  }, 10_000);

  it('issues and validates a real admin token end to end', async () => {
    const adminTokens = new AdminTokenService(prisma);
    const issued = await adminTokens.issue('integration-test');

    await expect(adminTokens.validate(issued.token)).resolves.toBe(true);
    await expect(adminTokens.validate('adm_not-a-real-token')).resolves.toBe(false);

    await adminTokens.revoke(issued.id);
    await expect(adminTokens.validate(issued.token)).resolves.toBe(false);
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
