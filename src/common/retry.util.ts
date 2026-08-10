export interface RetryOptions {
  maxAttempts: number;
  baseDelayMs: number;
  jitterPct: number;
  onAttemptFailure?: (error: unknown, attempt: number, nextDelayMs: number) => void;
}

export async function withRetry<T>(
  operation: (attempt: number) => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const maxAttempts = Math.max(1, options.maxAttempts);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await operation(attempt);
    } catch (error) {
      if (attempt === maxAttempts) {
        throw error;
      }

      const nextDelayMs = computeBackoffDelayMs(attempt, options.baseDelayMs, options.jitterPct);
      options.onAttemptFailure?.(error, attempt, nextDelayMs);
      await sleep(nextDelayMs);
    }
  }

  throw new Error('withRetry: exhausted attempts without a result — this should never happen.');
}

export function computeBackoffDelayMs(
  attempt: number,
  baseDelayMs: number,
  jitterPct: number,
): number {
  const exponential = baseDelayMs * 2 ** (attempt - 1);
  const jitterFraction = Math.min(Math.max(jitterPct, 0), 100) / 100;
  const min = exponential * (1 - jitterFraction);
  const max = exponential * (1 + jitterFraction);
  return min + Math.random() * (max - min);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
