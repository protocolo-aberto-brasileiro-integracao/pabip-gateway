import { CircuitState } from 'cockatiel';
import { CircuitBreakerRegistry } from './circuit-breaker.registry';
import type { ConfigService } from '../config/config.service';

function buildConfigService(
  overrides: Partial<{ errorThreshold: number; windowSeconds: number }> = {},
) {
  return {
    circuitBreaker: {
      errorThreshold: 0.5,
      windowSeconds: 30,
      ...overrides,
    },
  } as unknown as ConfigService;
}

describe('CircuitBreakerRegistry', () => {
  it('creates a new policy on first use and returns the same instance afterwards', () => {
    const registry = new CircuitBreakerRegistry(buildConfigService());

    const first = registry.getOrCreate('peer-1', 'outbound');
    const second = registry.getOrCreate('peer-1', 'outbound');

    expect(second).toBe(first);
    expect(first.state).toBe(CircuitState.Closed);
  });

  it('keeps outbound and sink breakers independent for the same peer', () => {
    const registry = new CircuitBreakerRegistry(buildConfigService());

    const outbound = registry.getOrCreate('peer-1', 'outbound');
    const sink = registry.getOrCreate('peer-1', 'sink');

    expect(outbound).not.toBe(sink);
  });

  it('keeps breakers independent per peer', () => {
    const registry = new CircuitBreakerRegistry(buildConfigService());

    const peerOne = registry.getOrCreate('peer-1', 'outbound');
    const peerTwo = registry.getOrCreate('peer-2', 'outbound');

    expect(peerOne).not.toBe(peerTwo);
  });

  it('returns undefined from get() for a pair that has never been created', () => {
    const registry = new CircuitBreakerRegistry(buildConfigService());

    expect(registry.get('peer-1', 'outbound')).toBeUndefined();
  });

  it('lists every breaker created so far with its peerId and destination', () => {
    const registry = new CircuitBreakerRegistry(buildConfigService());
    registry.getOrCreate('peer-1', 'outbound');
    registry.getOrCreate('peer-1', 'sink');

    const entries = registry.list();

    expect(entries).toHaveLength(2);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ peerId: 'peer-1', destination: 'outbound' }),
        expect.objectContaining({ peerId: 'peer-1', destination: 'sink' }),
      ]),
    );
  });

  it('removes both entries for a peer, leaving other peers untouched', () => {
    const registry = new CircuitBreakerRegistry(buildConfigService());
    registry.getOrCreate('peer-1', 'outbound');
    registry.getOrCreate('peer-1', 'sink');
    registry.getOrCreate('peer-2', 'outbound');

    registry.removePeer('peer-1');

    expect(registry.get('peer-1', 'outbound')).toBeUndefined();
    expect(registry.get('peer-1', 'sink')).toBeUndefined();
    expect(registry.get('peer-2', 'outbound')).toBeDefined();
  });

  it('is a no-op when removing a peer with no breakers', () => {
    const registry = new CircuitBreakerRegistry(buildConfigService());

    expect(() => registry.removePeer('never-existed')).not.toThrow();
  });

  it('builds each breaker from the live config at creation time', () => {
    const configService = buildConfigService({ errorThreshold: 0.9, windowSeconds: 5 });
    const registry = new CircuitBreakerRegistry(configService);

    expect(() => registry.getOrCreate('peer-1', 'outbound')).not.toThrow();
  });
});
