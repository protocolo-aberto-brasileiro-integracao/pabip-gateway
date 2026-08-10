export type CircuitBreakerDestination = 'outbound' | 'sink';

export const CIRCUIT_BREAKER_DESTINATIONS: readonly CircuitBreakerDestination[] = [
  'outbound',
  'sink',
];

export const CIRCUIT_BREAKER_MINIMUM_RPS = 10;

export const CIRCUIT_BREAKER_HALF_OPEN_AFTER_MS = 30_000;
