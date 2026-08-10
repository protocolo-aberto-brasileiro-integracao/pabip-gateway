import { CircuitBreakerRegistry } from './circuit-breaker.registry';
import { CircuitBreakerService } from './circuit-breaker.service';
import type { ConfigService } from '../config/config.service';
import type { CircuitBreakerDestination } from './circuit-breaker.constants';

function buildConfigService(
  overrides: Partial<{ errorThreshold: number; windowSeconds: number }> = {},
): ConfigService {
  return {
    circuitBreaker: {
      errorThreshold: 0.5,
      windowSeconds: 1,
      ...overrides,
    },
  } as unknown as ConfigService;
}

async function tripOpen(
  service: CircuitBreakerService,
  peerId: string,
  destination: CircuitBreakerDestination,
): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    try {
      await service.execute(peerId, destination, () => {
        throw new Error('downstream failure');
      });
    } catch (error) {
      void error;
    }
  }
}

describe('CircuitBreakerService', () => {
  let registry: CircuitBreakerRegistry;
  let service: CircuitBreakerService;

  beforeEach(() => {
    registry = new CircuitBreakerRegistry(buildConfigService());
    service = new CircuitBreakerService(registry);
  });

  it('reports "closed" for a pair that never had a call attempted', () => {
    expect(service.getState('peer-1', 'outbound')).toBe('closed');
  });

  it('runs the given function and returns its result while closed', async () => {
    const result = await service.execute('peer-1', 'outbound', () => 'ok');

    expect(result).toBe('ok');
    expect(service.getState('peer-1', 'outbound')).toBe('closed');
  });

  it('propagates the original error from a failing call', async () => {
    await expect(
      service.execute('peer-1', 'outbound', () => {
        throw new Error('downstream failure');
      }),
    ).rejects.toThrow('downstream failure');
  });

  it('opens once enough failures cross the configured error threshold', async () => {
    await tripOpen(service, 'peer-1', 'outbound');

    expect(service.getState('peer-1', 'outbound')).toBe('open');
  });

  it('keeps outbound and sink states independent for the same peer', async () => {
    await tripOpen(service, 'peer-1', 'outbound');

    expect(service.getState('peer-1', 'outbound')).toBe('open');
    expect(service.getState('peer-1', 'sink')).toBe('closed');
  });

  it('lists every breaker created so far with its resolved state', async () => {
    await tripOpen(service, 'peer-1', 'outbound');
    await service.execute('peer-2', 'sink', () => 'ok');

    expect(service.listStates()).toEqual(
      expect.arrayContaining([
        { peerId: 'peer-1', destination: 'outbound', state: 'open' },
        { peerId: 'peer-2', destination: 'sink', state: 'closed' },
      ]),
    );
  });

  it('removeBreaker clears both entries for a peer', async () => {
    await tripOpen(service, 'peer-1', 'outbound');
    await service.execute('peer-1', 'sink', () => 'ok');

    service.removeBreaker('peer-1');

    expect(service.getState('peer-1', 'outbound')).toBe('closed');
    expect(service.listStates()).toHaveLength(0);
  });

  it('onPeerRemoved forwards to removeBreaker, satisfying the PeerRemovalListener contract', async () => {
    await tripOpen(service, 'peer-1', 'outbound');

    service.onPeerRemoved('peer-1');

    expect(service.getState('peer-1', 'outbound')).toBe('closed');
  });

  it('reports "half-open" once the fixed wait has passed and a probe call is let through', async () => {
    jest.useFakeTimers();
    try {
      await tripOpen(service, 'peer-1', 'outbound');
      expect(service.getState('peer-1', 'outbound')).toBe('open');

      jest.advanceTimersByTime(31_000);

      const probe = service.execute('peer-1', 'outbound', () => 'recovered');
      expect(service.getState('peer-1', 'outbound')).toBe('half-open');

      await expect(probe).resolves.toBe('recovered');
      expect(service.getState('peer-1', 'outbound')).toBe('closed');
    } finally {
      jest.useRealTimers();
    }
  });
});
