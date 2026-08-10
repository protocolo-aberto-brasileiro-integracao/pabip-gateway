import { Injectable } from '@nestjs/common';
import { circuitBreaker, handleAll, SamplingBreaker, type CircuitBreakerPolicy } from 'cockatiel';
import { ConfigService } from '../config/config.service';
import {
  CIRCUIT_BREAKER_DESTINATIONS,
  CIRCUIT_BREAKER_HALF_OPEN_AFTER_MS,
  CIRCUIT_BREAKER_MINIMUM_RPS,
  type CircuitBreakerDestination,
} from './circuit-breaker.constants';

export interface CircuitBreakerRegistryEntry {
  peerId: string;
  destination: CircuitBreakerDestination;
  policy: CircuitBreakerPolicy;
}

function compositeKey(peerId: string, destination: CircuitBreakerDestination): string {
  return `${peerId}:${destination}`;
}

@Injectable()
export class CircuitBreakerRegistry {
  private readonly breakers = new Map<string, CircuitBreakerRegistryEntry>();

  constructor(private readonly configService: ConfigService) {}

  getOrCreate(peerId: string, destination: CircuitBreakerDestination): CircuitBreakerPolicy {
    const key = compositeKey(peerId, destination);
    const existing = this.breakers.get(key);
    if (existing) {
      return existing.policy;
    }

    const policy = this.build();
    this.breakers.set(key, { peerId, destination, policy });
    return policy;
  }

  get(peerId: string, destination: CircuitBreakerDestination): CircuitBreakerPolicy | undefined {
    return this.breakers.get(compositeKey(peerId, destination))?.policy;
  }

  list(): CircuitBreakerRegistryEntry[] {
    return [...this.breakers.values()];
  }

  removePeer(peerId: string): void {
    for (const destination of CIRCUIT_BREAKER_DESTINATIONS) {
      this.breakers.delete(compositeKey(peerId, destination));
    }
  }

  private build(): CircuitBreakerPolicy {
    const { errorThreshold, windowSeconds } = this.configService.circuitBreaker;

    return circuitBreaker(handleAll, {
      halfOpenAfter: CIRCUIT_BREAKER_HALF_OPEN_AFTER_MS,
      breaker: new SamplingBreaker({
        threshold: errorThreshold,
        duration: windowSeconds * 1000,
        minimumRps: CIRCUIT_BREAKER_MINIMUM_RPS,
      }),
    });
  }
}
