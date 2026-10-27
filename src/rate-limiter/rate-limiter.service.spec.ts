const mockRedisOn = jest.fn();
const mockRedisQuit = jest.fn().mockResolvedValue('OK');

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    on: mockRedisOn,
    quit: mockRedisQuit,
  }));
});

import Redis from 'ioredis';
import { RateLimiterMemory } from 'rate-limiter-flexible';
import { RateLimiterService } from './rate-limiter.service';

describe('RateLimiterService', () => {
  beforeEach(() => {
    delete process.env.GATEWAY_REDIS_URL;
    delete process.env.REDIS_URL;
  });

  it('allows requests within the inbound quota', async () => {
    const service = new RateLimiterService();

    const result = await service.consume('peer-1', 'in');

    expect(result).toEqual({ allowed: true });
  });

  it('allows requests within the outbound quota', async () => {
    const service = new RateLimiterService();

    const result = await service.consume('peer-1', 'out');

    expect(result).toEqual({ allowed: true });
  });

  it('rejects once the inbound quota for a peer is exhausted, with a Retry-After in seconds', async () => {
    const service = new RateLimiterService();

    for (let i = 0; i < 300; i += 1) {
      await service.consume('peer-1', 'in');
    }

    const rejected = await service.consume('peer-1', 'in');

    expect(rejected.allowed).toBe(false);
    expect(rejected.retryAfterSeconds).toBeGreaterThanOrEqual(1);
  });

  it('keeps inbound and outbound quotas fully independent for the same peer', async () => {
    const service = new RateLimiterService();

    for (let i = 0; i < 300; i += 1) {
      await service.consume('peer-1', 'in');
    }

    const outboundResult = await service.consume('peer-1', 'out');

    expect(outboundResult).toEqual({ allowed: true });
  });

  it('keeps quotas independent per peer', async () => {
    const service = new RateLimiterService();

    for (let i = 0; i < 300; i += 1) {
      await service.consume('peer-1', 'in');
    }

    const otherPeerResult = await service.consume('peer-2', 'in');

    expect(otherPeerResult).toEqual({ allowed: true });
  });

  it('re-throws anything that is not a quota rejection instead of treating it as allowed', async () => {
    const service = new RateLimiterService();
    const boom = new Error('unexpected store failure');
    jest.spyOn(RateLimiterMemory.prototype, 'consume').mockRejectedValueOnce(boom);

    await expect(service.consume('peer-1', 'in')).rejects.toThrow(boom);
  });

  describe('consumePeersAccess', () => {
    it('allows requests within the /peers/* client-token quota', async () => {
      const service = new RateLimiterService();

      const result = await service.consumePeersAccess('clt-1');

      expect(result).toEqual({ allowed: true });
    });

    it('rejects once the quota for a client token is exhausted, with a Retry-After in seconds', async () => {
      const service = new RateLimiterService();

      for (let i = 0; i < 60; i += 1) {
        await service.consumePeersAccess('clt-1');
      }

      const rejected = await service.consumePeersAccess('clt-1');

      expect(rejected.allowed).toBe(false);
      expect(rejected.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    });

    it('keeps quotas independent per client token, and independent from consume()', async () => {
      const service = new RateLimiterService();

      for (let i = 0; i < 60; i += 1) {
        await service.consumePeersAccess('clt-1');
      }

      const otherTokenResult = await service.consumePeersAccess('clt-2');
      const inboundResult = await service.consume('clt-1', 'in');

      expect(otherTokenResult).toEqual({ allowed: true });
      expect(inboundResult).toEqual({ allowed: true });
    });
  });

  describe('when a Redis URL is configured', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      process.env.GATEWAY_REDIS_URL = 'redis://fake-host:6379';
    });

    it('builds a single ioredis client and shares it across all quotas', () => {
      new RateLimiterService();

      expect(Redis).toHaveBeenCalledTimes(1);
      expect(Redis).toHaveBeenCalledWith(
        'redis://fake-host:6379',
        expect.objectContaining({ enableOfflineQueue: false }),
      );
      expect(mockRedisOn).toHaveBeenCalledWith('error', expect.any(Function));
    });

    it('prefers GATEWAY_REDIS_URL over REDIS_URL when both are set', () => {
      process.env.REDIS_URL = 'redis://other-host:6379';

      new RateLimiterService();

      expect(Redis).toHaveBeenCalledWith('redis://fake-host:6379', expect.any(Object));
    });

    it('falls back to REDIS_URL when GATEWAY_REDIS_URL is unset', () => {
      delete process.env.GATEWAY_REDIS_URL;
      process.env.REDIS_URL = 'redis://other-host:6379';

      new RateLimiterService();

      expect(Redis).toHaveBeenCalledWith('redis://other-host:6379', expect.any(Object));
    });

    it('fails open to the in-memory insurance limiter when the Redis store errors', async () => {
      const service = new RateLimiterService();

      const result = await service.consume('peer-redis-1', 'in');

      expect(result).toEqual({ allowed: true });
    });

    it('still enforces the quota via the in-memory insurance limiter once Redis is unreachable', async () => {
      const service = new RateLimiterService();

      for (let i = 0; i < 300; i += 1) {
        await service.consume('peer-redis-2', 'in');
      }

      const rejected = await service.consume('peer-redis-2', 'in');

      expect(rejected.allowed).toBe(false);
      expect(rejected.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    });

    it('releases the ioredis client on module destroy', async () => {
      const service = new RateLimiterService();

      await service.onModuleDestroy();

      expect(mockRedisQuit).toHaveBeenCalledTimes(1);
    });
  });
});
