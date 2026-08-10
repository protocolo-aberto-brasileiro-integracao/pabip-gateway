import { computeBackoffDelayMs, withRetry } from './retry.util';

describe('withRetry', () => {
  it('returns the result of the first successful attempt without retrying', async () => {
    const operation = jest.fn().mockResolvedValue('ok');

    const result = await withRetry(operation, { maxAttempts: 3, baseDelayMs: 1, jitterPct: 0 });

    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('retries on failure up to maxAttempts, then resolves once it succeeds', async () => {
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('first failure'))
      .mockRejectedValueOnce(new Error('second failure'))
      .mockResolvedValueOnce('ok');

    const result = await withRetry(operation, { maxAttempts: 5, baseDelayMs: 1, jitterPct: 0 });

    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('throws the last error once maxAttempts is exhausted', async () => {
    const finalError = new Error('final failure');
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('first failure'))
      .mockRejectedValueOnce(finalError);

    await expect(
      withRetry(operation, { maxAttempts: 2, baseDelayMs: 1, jitterPct: 0 }),
    ).rejects.toThrow(finalError);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it('never retries when maxAttempts is 1', async () => {
    const error = new Error('nope');
    const operation = jest.fn().mockRejectedValue(error);

    await expect(
      withRetry(operation, { maxAttempts: 1, baseDelayMs: 1, jitterPct: 0 }),
    ).rejects.toThrow(error);
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('treats a non-positive maxAttempts the same as 1 attempt', async () => {
    const operation = jest.fn().mockResolvedValue('ok');

    const result = await withRetry(operation, { maxAttempts: 0, baseDelayMs: 1, jitterPct: 0 });

    expect(result).toBe('ok');
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it('invokes onAttemptFailure with the error, attempt number, and next delay for every retried failure', async () => {
    const onAttemptFailure = jest.fn();
    const operation = jest
      .fn()
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValueOnce('ok');

    await withRetry(operation, {
      maxAttempts: 3,
      baseDelayMs: 1,
      jitterPct: 0,
      onAttemptFailure,
    });

    expect(onAttemptFailure).toHaveBeenCalledTimes(1);
    expect(onAttemptFailure).toHaveBeenCalledWith(expect.any(Error), 1, expect.any(Number));
  });

  it('never calls onAttemptFailure for the final, unretried failure', async () => {
    const onAttemptFailure = jest.fn();
    const operation = jest.fn().mockRejectedValue(new Error('boom'));

    await expect(
      withRetry(operation, { maxAttempts: 2, baseDelayMs: 1, jitterPct: 0, onAttemptFailure }),
    ).rejects.toThrow();

    expect(onAttemptFailure).toHaveBeenCalledTimes(1);
  });
});

describe('computeBackoffDelayMs', () => {
  it('doubles the base delay per attempt with zero jitter', () => {
    expect(computeBackoffDelayMs(1, 1000, 0)).toBe(1000);
    expect(computeBackoffDelayMs(2, 1000, 0)).toBe(2000);
    expect(computeBackoffDelayMs(3, 1000, 0)).toBe(4000);
  });

  it('keeps the jittered delay within the +/- pct window', () => {
    for (let i = 0; i < 50; i++) {
      const delay = computeBackoffDelayMs(2, 1000, 25);
      expect(delay).toBeGreaterThanOrEqual(1500);
      expect(delay).toBeLessThanOrEqual(2500);
    }
  });

  it('clamps an out-of-range jitterPct instead of producing a negative window', () => {
    const delay = computeBackoffDelayMs(1, 1000, 150);
    expect(delay).toBeGreaterThanOrEqual(0);
    expect(delay).toBeLessThanOrEqual(2000);
  });
});
