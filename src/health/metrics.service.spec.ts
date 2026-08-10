import type { CircuitBreakerStateEntry } from '../circuit-breaker/circuit-breaker.service';
import { HEALTH_METRICS_MAX_PEER_LABELS } from './health.constants';
import { MetricsService } from './metrics.service';

function buildService(overrides: {
  circuitBreakerStates?: CircuitBreakerStateEntry[];
  storeAvailable?: boolean;
}) {
  const circuitBreaker = {
    listStates: jest.fn().mockReturnValue(overrides.circuitBreakerStates ?? []),
  };
  const peerCache = {
    isStoreAvailable: jest.fn().mockReturnValue(overrides.storeAvailable ?? true),
  };
  const service = new MetricsService(circuitBreaker as never, peerCache as never);
  return { service, circuitBreaker, peerCache };
}

describe('MetricsService', () => {
  it('increments gateway_delivery_failed_total by peer for delivery_failed outcomes', async () => {
    const { service } = buildService({});

    service.recordDeliveryOutcome({
      reason: 'delivery_failed',
      peerId: 'peer-1',
      batchId: 'b1',
      batchType: 'plate',
      eventIds: ['e1'],
      attempts: 3,
      detail: 'x',
    });
    service.recordDeliveryOutcome({
      reason: 'delivery_failed',
      peerId: 'peer-1',
      batchId: 'b2',
      batchType: 'plate',
      eventIds: ['e2'],
      attempts: 3,
      detail: 'x',
    });

    const text = await service.metrics();
    expect(text).toMatch(/gateway_delivery_failed_total\{peer="peer-1"\} 2/);
  });

  it('does not count peer_concurrency_exceeded toward gateway_delivery_failed_total', async () => {
    const { service } = buildService({});

    service.recordDeliveryOutcome({
      reason: 'peer_concurrency_exceeded',
      peerId: 'peer-1',
      batchId: 'b1',
      batchType: 'plate',
      eventIds: ['e1'],
      attempts: 0,
      detail: 'x',
    });

    const text = await service.metrics();
    expect(text).not.toMatch(/gateway_delivery_failed_total\{peer="peer-1"\}/);
  });

  it('bounds distinct peer labels, folding overflow into one _overflow series', async () => {
    const { service } = buildService({});

    for (let i = 0; i < HEALTH_METRICS_MAX_PEER_LABELS + 2; i += 1) {
      service.recordDeliveryOutcome({
        reason: 'delivery_failed',
        peerId: `peer-${i}`,
        batchId: 'b',
        batchType: 'plate',
        eventIds: ['e'],
        attempts: 3,
        detail: 'x',
      });
    }

    const text = await service.metrics();
    const peerSeriesCount = [...text.matchAll(/gateway_delivery_failed_total\{peer="[^"]+"\}/g)]
      .length;

    expect(peerSeriesCount).toBe(HEALTH_METRICS_MAX_PEER_LABELS + 1);
    expect(text).toMatch(/gateway_delivery_failed_total\{peer="_overflow"\} 2/);
  });

  it('reports gateway_peer_store_unavailable as 0 when the peer store is available', async () => {
    const { service } = buildService({ storeAvailable: true });

    const text = await service.metrics();
    expect(text).toMatch(/gateway_peer_store_unavailable 0/);
  });

  it('reports gateway_peer_store_unavailable as 1 when the peer store is unavailable', async () => {
    const { service } = buildService({ storeAvailable: false });

    const text = await service.metrics();
    expect(text).toMatch(/gateway_peer_store_unavailable 1/);
  });

  it('reflects live circuit breaker states, per (peer, destination), on every scrape', async () => {
    const { service, circuitBreaker } = buildService({
      circuitBreakerStates: [{ peerId: 'peer-1', destination: 'sink', state: 'open' }],
    });

    const first = await service.metrics();
    expect(first).toMatch(/gateway_circuit_breaker_state\{peer="peer-1",destination="sink"\} 2/);

    circuitBreaker.listStates.mockReturnValue([
      { peerId: 'peer-1', destination: 'sink', state: 'closed' },
    ]);
    const second = await service.metrics();
    expect(second).toMatch(/gateway_circuit_breaker_state\{peer="peer-1",destination="sink"\} 0/);
  });
});
