import { RateLimiterMemory } from 'rate-limiter-flexible';
import { RateLimiterService } from './rate-limiter.service';

describe('RateLimiterService', () => {
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
});
