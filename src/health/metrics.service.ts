import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Registry } from 'prom-client';
import {
  CircuitBreakerService,
  type CircuitBreakerStateLabel,
} from '../circuit-breaker/circuit-breaker.service';
import type { DeliveryAuditEvent } from '../output-sink/audit-sink.tokens';
import type { DeliveryMetricsRecorder } from '../output-sink/delivery-metrics.tokens';
import { PeerCacheService } from '../peers/peer-cache.service';
import {
  HEALTH_METRICS_MAX_PEER_LABELS,
  HEALTH_METRICS_OVERFLOW_PEER_LABEL,
} from './health.constants';

const CIRCUIT_BREAKER_STATE_VALUE: Record<CircuitBreakerStateLabel, number> = {
  closed: 0,
  'half-open': 1,
  open: 2,
  isolated: 3,
};

@Injectable()
export class MetricsService implements DeliveryMetricsRecorder {
  readonly registry = new Registry();

  private readonly deliveryFailedTotal: Counter<'peer'>;
  private readonly seenPeerLabels = new Set<string>();

  constructor(
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly peerCache: PeerCacheService,
  ) {
    this.deliveryFailedTotal = new Counter({
      name: 'gateway_delivery_failed_total',
      help: 'Batches that exhausted the retry window without a successful delivery, by peer (bounded — see health.constants.ts).',
      labelNames: ['peer'],
      registers: [this.registry],
    });

    const peerStoreUnavailable = new Gauge({
      name: 'gateway_peer_store_unavailable',
      help: '1 while the peer registry database is unreachable after boot, 0 otherwise. Never affects readiness.',
      registers: [this.registry],
      collect(): void {
        this.set(peerCache.isStoreAvailable() ? 0 : 1);
      },
    });
    void peerStoreUnavailable;

    const circuitBreakerState = new Gauge({
      name: 'gateway_circuit_breaker_state',
      help: 'Current circuit breaker state per (peer, destination): 0=closed, 1=half-open, 2=open, 3=isolated. Unbounded by peer id, deliberately — naturally small.',
      labelNames: ['peer', 'destination'],
      registers: [this.registry],
      collect(): void {
        this.reset();
        for (const entry of circuitBreaker.listStates()) {
          this.set(
            { peer: entry.peerId, destination: entry.destination },
            CIRCUIT_BREAKER_STATE_VALUE[entry.state],
          );
        }
      },
    });
    void circuitBreakerState;
  }

  recordDeliveryOutcome(event: DeliveryAuditEvent): void {
    if (event.reason !== 'delivery_failed') {
      return;
    }
    this.deliveryFailedTotal.inc({ peer: this.boundedPeerLabel(event.peerId) });
  }

  metrics(): Promise<string> {
    return this.registry.metrics();
  }

  private boundedPeerLabel(peerId: string): string {
    if (this.seenPeerLabels.has(peerId)) {
      return peerId;
    }
    if (this.seenPeerLabels.size < HEALTH_METRICS_MAX_PEER_LABELS) {
      this.seenPeerLabels.add(peerId);
      return peerId;
    }
    return HEALTH_METRICS_OVERFLOW_PEER_LABEL;
  }
}
