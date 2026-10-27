import { DbChangeNotifier } from '../common/db-change-notifier';
import { PeerCacheService, type CachedPeer } from './peer-cache.service';
import type { PeerRemovalListener } from './peer-removal.tokens';
import type { PeerStoreStatusListener } from './peer-store-status.tokens';

jest.mock('../common/db-change-notifier');

const MockedDbChangeNotifier = DbChangeNotifier as jest.MockedClass<typeof DbChangeNotifier>;

function buildRow(overrides: Partial<CachedPeer> = {}): CachedPeer {
  return {
    id: 'peer-1',
    name: 'acme',
    baseUrl: 'https://acme.example',
    theirApiKey: 'their-key',
    apiKeyHash: 'hash-1',
    scopes: ['plate:write'],
    ipAllowlist: [],
    capabilities: ['plate'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('PeerCacheService', () => {
  let findMany: jest.Mock;
  let prisma: { peer: { findMany: jest.Mock }; databaseUrl: string };

  beforeEach(() => {
    MockedDbChangeNotifier.mockClear();
    findMany = jest.fn().mockResolvedValue([buildRow()]);
    prisma = { peer: { findMany }, databaseUrl: 'postgresql://user:pass@host/db' };
  });

  it('builds both lookup maps from the initial reload', async () => {
    const service = new PeerCacheService(prisma as never);
    await service.onModuleInit();

    expect(service.getById('peer-1')?.name).toBe('acme');
    expect(service.getByApiKeyHash('hash-1')?.id).toBe('peer-1');
    expect(service.list()).toHaveLength(1);
  });

  it('starts a DbChangeNotifier on the peers_changed channel with the poll interval', async () => {
    const service = new PeerCacheService(prisma as never);
    await service.onModuleInit();

    expect(MockedDbChangeNotifier).toHaveBeenCalledWith(
      expect.objectContaining({
        channel: 'peers_changed',
        connectionString: prisma.databaseUrl,
        pollIntervalMs: 5_000,
      }),
    );
    const notifierInstance = MockedDbChangeNotifier.mock.instances[0] as unknown as {
      start: jest.Mock;
    };
    expect(notifierInstance.start).toHaveBeenCalled();
  });

  it('reloads when the notifier reports a change', async () => {
    const service = new PeerCacheService(prisma as never);
    await service.onModuleInit();

    findMany.mockResolvedValue([buildRow({ apiKeyHash: 'hash-2' })]);
    const onChange = MockedDbChangeNotifier.mock.calls[0][0].onChange;
    await onChange();

    expect(service.getByApiKeyHash('hash-1')).toBeUndefined();
    expect(service.getByApiKeyHash('hash-2')?.id).toBe('peer-1');
  });

  it('stops the notifier on destroy', async () => {
    const service = new PeerCacheService(prisma as never);
    await service.onModuleInit();
    await service.onModuleDestroy();

    const notifierInstance = MockedDbChangeNotifier.mock.instances[0] as unknown as {
      stop: jest.Mock;
    };
    expect(notifierInstance.stop).toHaveBeenCalled();
  });

  it('does nothing when no removal listener is bound and a peer disappears', async () => {
    const service = new PeerCacheService(prisma as never);
    await service.onModuleInit();

    findMany.mockResolvedValue([]);
    await expect(service.reload()).resolves.toBeUndefined();
    expect(service.list()).toHaveLength(0);
  });

  it('notifies the bound removal listener for a peer that existed before and is now gone', async () => {
    const onPeerRemoved = jest.fn();
    const listener: PeerRemovalListener = { onPeerRemoved };
    const service = new PeerCacheService(prisma as never, listener);
    await service.onModuleInit();

    findMany.mockResolvedValue([]);
    await service.reload();

    expect(onPeerRemoved).toHaveBeenCalledWith('peer-1');
  });

  it('does not call the removal listener for a peer that is still present', async () => {
    const onPeerRemoved = jest.fn();
    const listener: PeerRemovalListener = { onPeerRemoved };
    const service = new PeerCacheService(prisma as never, listener);
    await service.onModuleInit();

    await service.reload();

    expect(onPeerRemoved).not.toHaveBeenCalled();
  });

  describe('secret decryption', () => {
    it('decrypts theirApiKey through the secret cipher before caching and registering it', async () => {
      findMany.mockResolvedValue([buildRow({ theirApiKey: 'v1:encrypted(their-key)' })]);
      const decryptFromStorage = jest.fn().mockReturnValue('their-key');
      const service = new PeerCacheService(prisma as never, undefined, undefined, {
        decryptFromStorage,
      } as never);

      await service.onModuleInit();

      expect(decryptFromStorage).toHaveBeenCalledWith('v1:encrypted(their-key)');
      expect(service.getById('peer-1')?.theirApiKey).toBe('their-key');
    });

    it('leaves theirApiKey untouched when no secret cipher is bound', async () => {
      const service = new PeerCacheService(prisma as never);
      await service.onModuleInit();

      expect(service.getById('peer-1')?.theirApiKey).toBe('their-key');
    });
  });

  describe('peer store availability', () => {
    it('reports no initial snapshot and an available store before the first reload', () => {
      const service = new PeerCacheService(prisma as never);

      expect(service.hasInitialSnapshot()).toBe(false);
      expect(service.isStoreAvailable()).toBe(true);
    });

    it('reports an initial snapshot once the first reload succeeds', async () => {
      const service = new PeerCacheService(prisma as never);
      await service.onModuleInit();

      expect(service.hasInitialSnapshot()).toBe(true);
    });

    it('rethrows on the very first load failure, with no cache to fall back on', async () => {
      findMany.mockRejectedValue(new Error('connection refused'));
      const service = new PeerCacheService(prisma as never);

      await expect(service.reload()).rejects.toThrow('connection refused');
      expect(service.hasInitialSnapshot()).toBe(false);
    });

    it('keeps serving the last snapshot and marks the store unavailable when a later reload fails', async () => {
      const onPeerStoreAvailabilityChanged = jest.fn();
      const listener: PeerStoreStatusListener = { onPeerStoreAvailabilityChanged };
      const service = new PeerCacheService(prisma as never, undefined, listener);
      await service.onModuleInit();

      findMany.mockRejectedValue(new Error('connection lost'));
      await service.reload();

      expect(service.isStoreAvailable()).toBe(false);
      expect(service.getById('peer-1')?.name).toBe('acme');
      expect(onPeerStoreAvailabilityChanged).toHaveBeenCalledWith(false);
    });

    it('only reports the unavailable transition once across repeated failing polls', async () => {
      const onPeerStoreAvailabilityChanged = jest.fn();
      const listener: PeerStoreStatusListener = { onPeerStoreAvailabilityChanged };
      const service = new PeerCacheService(prisma as never, undefined, listener);
      await service.onModuleInit();

      findMany.mockRejectedValue(new Error('connection lost'));
      await service.reload();
      await service.reload();

      expect(onPeerStoreAvailabilityChanged).toHaveBeenCalledTimes(1);
    });

    it('reports the recovered transition once the database answers again', async () => {
      const onPeerStoreAvailabilityChanged = jest.fn();
      const listener: PeerStoreStatusListener = { onPeerStoreAvailabilityChanged };
      const service = new PeerCacheService(prisma as never, undefined, listener);
      await service.onModuleInit();

      findMany.mockRejectedValueOnce(new Error('connection lost'));
      await service.reload();
      findMany.mockResolvedValue([buildRow()]);
      await service.reload();

      expect(service.isStoreAvailable()).toBe(true);
      expect(onPeerStoreAvailabilityChanged).toHaveBeenNthCalledWith(1, false);
      expect(onPeerStoreAvailabilityChanged).toHaveBeenNthCalledWith(2, true);
    });
  });
});
