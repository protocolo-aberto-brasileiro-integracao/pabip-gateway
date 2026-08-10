import type { RetryOptions } from '../common/retry.util';

export const OUTBOUND_CLIENT_MAX_SOCKETS = 100;

export const OUTBOUND_CLIENT_TIMEOUT_MS = 10_000;

export const OUTBOUND_CLIENT_RETRY_OPTIONS: Pick<
  RetryOptions,
  'maxAttempts' | 'baseDelayMs' | 'jitterPct'
> = {
  maxAttempts: 3,
  baseDelayMs: 1_000,
  jitterPct: 25,
};

export const LISTING_CACHE_TTL_MS = 90_000;

export const LISTING_CACHE_MAX_ENTRIES = 500;
