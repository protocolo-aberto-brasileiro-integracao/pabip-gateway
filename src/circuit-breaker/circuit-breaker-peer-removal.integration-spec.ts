import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PrismaService } from '../prisma/prisma.service';
import { resetConfigFileCache } from '../config/config-file.loader';
import { PeerCacheService } from '../peers/peer-cache.service';
import { CircuitBreakerRegistry } from './circuit-breaker.registry';
import { CircuitBreakerService } from './circuit-breaker.service';
import type { ConfigService } from '../config/config.service';

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://gateway:gateway@localhost:5432/gateway?schema=public';

const ORIGINAL_ENV = { ...process.env };

function buildConfigService(): ConfigService {
  return {
    circuitBreaker: { errorThreshold: 0.5, windowSeconds: 30 },
  } as unknown as ConfigService;
}

describe('circuit-breaker + peers Prisma integration (real Postgres)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env = { ...ORIGINAL_ENV };
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.GATEWAY_CONFIG_FILE = join(
      tmpdir(),
      'does-not-exist-circuit-breaker-integration.yaml',
    );
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
    await prisma.peer.deleteMany({
      where: { name: { startsWith: 'circuit-breaker-integration-' } },
    });
  });

  it("clears a removed peer's breakers once the real cache reload picks up its deletion", async () => {
    const created = await prisma.peer.create({
      data: {
        name: 'circuit-breaker-integration-acme',
        baseUrl: 'https://acme.example',
        theirApiKey: 'their-key',
        apiKeyHash: 'hash-circuit-breaker-integration-1',
        scopes: ['plate:write'],
        ipAllowlist: [],
        capabilities: ['plate'],
      },
    });

    const circuitBreaker = new CircuitBreakerService(
      new CircuitBreakerRegistry(buildConfigService()),
    );
    const cache = new PeerCacheService(prisma, circuitBreaker);

    try {
      await cache.onModuleInit();
      expect(cache.getById(created.id)).toBeDefined();

      await expect(
        circuitBreaker.execute(created.id, 'outbound', () => {
          throw new Error('downstream failure');
        }),
      ).rejects.toThrow('downstream failure');
      expect(circuitBreaker.listStates()).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ peerId: created.id, destination: 'outbound' }),
        ]),
      );

      await prisma.peer.delete({ where: { id: created.id } });
      await prisma.$executeRawUnsafe(`NOTIFY peers_changed`);

      await waitFor(() => cache.getById(created.id) === undefined, 5_000);
      expect(
        circuitBreaker
          .listStates()
          .some((entry) => entry.peerId === created.id && entry.destination === 'outbound'),
      ).toBe(false);
      expect(circuitBreaker.getState(created.id, 'outbound')).toBe('closed');
    } finally {
      await cache.onModuleDestroy();
    }
  }, 10_000);
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
