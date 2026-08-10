import { Injectable } from '@nestjs/common';
import { CircuitState } from 'cockatiel';
import type { PeerRemovalListener } from '../peers/peer-removal.tokens';
import { CircuitBreakerRegistry } from './circuit-breaker.registry';
import type { CircuitBreakerDestination } from './circuit-breaker.constants';

export type CircuitBreakerStateLabel = 'closed' | 'open' | 'half-open' | 'isolated';

export interface CircuitBreakerStateEntry {
  peerId: string;
  destination: CircuitBreakerDestination;
  state: CircuitBreakerStateLabel;
}

function toStateLabel(state: CircuitState): CircuitBreakerStateLabel {
  switch (state) {
    case CircuitState.Open:
      return 'open';
    case CircuitState.HalfOpen:
      return 'half-open';
    case CircuitState.Isolated:
      return 'isolated';
    case CircuitState.Closed:
    default:
      return 'closed';
  }
}

@Injectable()
export class CircuitBreakerService implements PeerRemovalListener {
  constructor(private readonly registry: CircuitBreakerRegistry) {}

  execute<T>(
    peerId: string,
    destination: CircuitBreakerDestination,
    fn: () => Promise<T> | T,
  ): Promise<T> {
    return this.registry.getOrCreate(peerId, destination).execute(fn);
  }

  getState(peerId: string, destination: CircuitBreakerDestination): CircuitBreakerStateLabel {
    const policy = this.registry.get(peerId, destination);
    return policy ? toStateLabel(policy.state) : 'closed';
  }

  listStates(): CircuitBreakerStateEntry[] {
    return this.registry.list().map(({ peerId, destination, policy }) => ({
      peerId,
      destination,
      state: toStateLabel(policy.state),
    }));
  }

  removeBreaker(peerId: string): void {
    this.registry.removePeer(peerId);
  }

  onPeerRemoved(peerId: string): void {
    this.removeBreaker(peerId);
  }
}
