import { ConcurrencyLimiter, PeerConcurrencyExceededError } from './concurrency-limiter';

function buildConfigService(maxConcurrentPerPeer: number): {
  delivery: { maxConcurrentPerPeer: number };
} {
  return { delivery: { maxConcurrentPerPeer } };
}

describe('ConcurrencyLimiter', () => {
  it('runs fn and releases the slot on success', async () => {
    const limiter = new ConcurrencyLimiter(buildConfigService(2) as never);

    const result = await limiter.run('peer-1', () => Promise.resolve('ok'));

    expect(result).toBe('ok');
    expect(limiter.getInFlightCount('peer-1')).toBe(0);
  });

  it('releases the slot even when fn rejects', async () => {
    const limiter = new ConcurrencyLimiter(buildConfigService(2) as never);

    await expect(limiter.run('peer-1', () => Promise.reject(new Error('boom')))).rejects.toThrow(
      'boom',
    );

    expect(limiter.getInFlightCount('peer-1')).toBe(0);
  });

  it('allows up to the configured limit of concurrent in-flight batches', async () => {
    const limiter = new ConcurrencyLimiter(buildConfigService(2) as never);
    let resolveFirst!: () => void;
    const first = limiter.run(
      'peer-1',
      () =>
        new Promise<string>((resolve) => {
          resolveFirst = () => resolve('first');
        }),
    );

    expect(limiter.getInFlightCount('peer-1')).toBe(1);

    const second = limiter.run('peer-1', () => Promise.resolve('second'));
    await second;
    expect(limiter.getInFlightCount('peer-1')).toBe(1);

    resolveFirst();
    await first;
    expect(limiter.getInFlightCount('peer-1')).toBe(0);
  });

  it('rejects immediately with PeerConcurrencyExceededError once the peer is at its ceiling', async () => {
    const limiter = new ConcurrencyLimiter(buildConfigService(1) as never);
    let resolveFirst!: () => void;
    const first = limiter.run(
      'peer-1',
      () =>
        new Promise<string>((resolve) => {
          resolveFirst = () => resolve('first');
        }),
    );

    const fn = jest.fn();
    await expect(limiter.run('peer-1', fn)).rejects.toThrow(PeerConcurrencyExceededError);
    expect(fn).not.toHaveBeenCalled();

    resolveFirst();
    await first;
  });

  it('tracks each peer independently', async () => {
    const limiter = new ConcurrencyLimiter(buildConfigService(1) as never);
    let resolveFirst!: () => void;
    const first = limiter.run(
      'peer-1',
      () =>
        new Promise<string>((resolve) => {
          resolveFirst = () => resolve('first');
        }),
    );

    await expect(limiter.run('peer-2', () => Promise.resolve('ok'))).resolves.toBe('ok');

    resolveFirst();
    await first;
  });
});
