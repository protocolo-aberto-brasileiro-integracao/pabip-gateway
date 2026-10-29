import { ConcurrencyLimiter } from './concurrency-limiter';
import { OutputSinkService } from './output-sink.service';
import type { DeliveryBatch } from './output-sink.interface';

function buildBatch(): DeliveryBatch {
  return {
    batchId: 'batch-1',
    batchTime: '2026-05-08T14:00:00-03:00',
    batchCount: 1,
    batchType: 'plate',
    events: [
      {
        eventId: 'event-1',
        eventTime: '2026-05-08T14:00:00-03:00',
        sensorNodeId: 'node-1',
        partnerName: 'Acme',
        latitude: 0,
        longitude: 0,
        evidenceUrl: 'https://example.test/crop.jpg',
        data: { plate: 'ABC1D23', confidence: 0.97 },
      },
    ],
  };
}

function buildService(overrides: {
  outputType?: 'callback' | 'queue' | 'db';
  maxConcurrentPerPeer?: number;
  retry?: { maxAttempts: number; baseDelayMs: number; jitterPct: number };
  auditSink?: { recordDeliveryEvent: jest.Mock };
  metricsRecorder?: { recordDeliveryOutcome: jest.Mock };
}) {
  const configService = {
    output: { type: overrides.outputType ?? 'callback' },
    delivery: { maxConcurrentPerPeer: overrides.maxConcurrentPerPeer ?? 20 },
    retry: overrides.retry ?? { maxAttempts: 3, baseDelayMs: 1, jitterPct: 0 },
  } as never;

  const circuitBreaker = {
    execute: jest.fn((_peerId: string, _destination: string, fn: () => unknown) => fn()),
  };
  const concurrencyLimiter = new ConcurrencyLimiter(configService);
  const callbackDriver = { deliver: jest.fn().mockResolvedValue(undefined) };
  const queueDriver = { deliver: jest.fn().mockResolvedValue(undefined) };
  const dbDriver = { deliver: jest.fn().mockResolvedValue(undefined) };

  const service = new OutputSinkService(
    configService,
    circuitBreaker as never,
    concurrencyLimiter,
    callbackDriver as never,
    queueDriver as never,
    dbDriver as never,
    overrides.auditSink,
    overrides.metricsRecorder,
  );

  return {
    service,
    circuitBreaker,
    concurrencyLimiter,
    callbackDriver,
    queueDriver,
    dbDriver,
    configService,
  };
}

describe('OutputSinkService', () => {
  it('delivers through the callback driver when output.type = callback', async () => {
    const { service, callbackDriver, queueDriver, dbDriver } = buildService({
      outputType: 'callback',
    });
    const batch = buildBatch();

    await service.deliver(batch, 'peer-1', 'plate', 'req-7');

    expect(callbackDriver.deliver).toHaveBeenCalledWith(batch, 'peer-1', 'plate', 'req-7');
    expect(queueDriver.deliver).not.toHaveBeenCalled();
    expect(dbDriver.deliver).not.toHaveBeenCalled();
  });

  it('delivers through the queue driver when output.type = queue', async () => {
    const { service, queueDriver } = buildService({ outputType: 'queue' });
    await service.deliver(buildBatch(), 'peer-1', 'plate');
    expect(queueDriver.deliver).toHaveBeenCalled();
  });

  it('delivers through the db driver when output.type = db', async () => {
    const { service, dbDriver } = buildService({ outputType: 'db' });
    await service.deliver(buildBatch(), 'peer-1', 'plate');
    expect(dbDriver.deliver).toHaveBeenCalled();
  });

  it('wraps every attempt in the circuit breaker for (peerId, "sink")', async () => {
    const { service, circuitBreaker } = buildService({});
    await service.deliver(buildBatch(), 'peer-1', 'plate');
    expect(circuitBreaker.execute).toHaveBeenCalledWith('peer-1', 'sink', expect.any(Function));
  });

  it('retries a failing driver up to retry.maxAttempts, then succeeds if a later attempt works', async () => {
    const { service, callbackDriver } = buildService({
      retry: { maxAttempts: 3, baseDelayMs: 1, jitterPct: 0 },
    });
    callbackDriver.deliver
      .mockRejectedValueOnce(new Error('timeout'))
      .mockResolvedValueOnce(undefined);

    await service.deliver(buildBatch(), 'peer-1', 'plate');

    expect(callbackDriver.deliver).toHaveBeenCalledTimes(2);
  });

  it('never rejects, and records a delivery_failed audit event once retries are exhausted', async () => {
    const recordDeliveryEvent = jest.fn();
    const { service, callbackDriver } = buildService({
      retry: { maxAttempts: 2, baseDelayMs: 1, jitterPct: 0 },
      auditSink: { recordDeliveryEvent },
    });
    callbackDriver.deliver.mockRejectedValue(new Error('destination unreachable'));

    await expect(service.deliver(buildBatch(), 'peer-1', 'plate')).resolves.toBeUndefined();

    expect(callbackDriver.deliver).toHaveBeenCalledTimes(2);
    expect(recordDeliveryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'delivery_failed',
        peerId: 'peer-1',
        batchId: 'batch-1',
        batchType: 'plate',
        eventIds: ['event-1'],
        attempts: 2,
        detail: 'destination unreachable',
      }),
    );
  });

  it('falls back to logging when no audit sink is bound, without throwing', async () => {
    const { service, callbackDriver } = buildService({
      retry: { maxAttempts: 1, baseDelayMs: 1, jitterPct: 0 },
    });
    callbackDriver.deliver.mockRejectedValue(new Error('boom'));

    await expect(service.deliver(buildBatch(), 'peer-1', 'plate')).resolves.toBeUndefined();
  });

  it('reports delivery_failed to the metrics recorder independently of the audit sink', async () => {
    const recordDeliveryOutcome = jest.fn();
    const { service, callbackDriver } = buildService({
      retry: { maxAttempts: 1, baseDelayMs: 1, jitterPct: 0 },
      metricsRecorder: { recordDeliveryOutcome },
    });
    callbackDriver.deliver.mockRejectedValue(new Error('boom'));

    await service.deliver(buildBatch(), 'peer-1', 'plate');

    expect(recordDeliveryOutcome).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'delivery_failed', peerId: 'peer-1' }),
    );
  });

  it('records peer_concurrency_exceeded, with zero attempts, when the peer is already at its ceiling', async () => {
    const recordDeliveryEvent = jest.fn();
    const { service, callbackDriver } = buildService({
      maxConcurrentPerPeer: 1,
      auditSink: { recordDeliveryEvent },
    });

    let releaseFirst!: () => void;
    callbackDriver.deliver.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        }),
    );

    const first = service.deliver(buildBatch(), 'peer-1', 'plate');
    await service.deliver(buildBatch(), 'peer-1', 'plate');

    expect(recordDeliveryEvent).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'peer_concurrency_exceeded', attempts: 0 }),
    );
    expect(callbackDriver.deliver).toHaveBeenCalledTimes(1);

    releaseFirst();
    await first;
  });

  it('does not count a concurrency rejection against the circuit breaker', async () => {
    const { service, circuitBreaker, callbackDriver } = buildService({ maxConcurrentPerPeer: 1 });

    let releaseFirst!: () => void;
    callbackDriver.deliver.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          releaseFirst = resolve;
        }),
    );

    const first = service.deliver(buildBatch(), 'peer-1', 'plate');
    await service.deliver(buildBatch(), 'peer-1', 'plate');

    expect(circuitBreaker.execute).toHaveBeenCalledTimes(1);

    releaseFirst();
    await first;
  });

  describe('in-flight delivery tracking', () => {
    it('reports no in-flight deliveries when nothing is running', () => {
      const { service } = buildService({});
      expect(service.hasInFlightDeliveries()).toBe(false);
      expect(service.listInFlightDeliveries()).toEqual([]);
    });

    it('tracks a delivery as in flight only while its attempt is still executing', async () => {
      const { service, callbackDriver } = buildService({});

      let releaseFirst!: () => void;
      callbackDriver.deliver.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFirst = resolve;
          }),
      );

      const inFlight = service.deliver(buildBatch(), 'peer-1', 'plate');

      await Promise.resolve();
      await Promise.resolve();

      expect(service.hasInFlightDeliveries()).toBe(true);
      expect(service.listInFlightDeliveries()).toEqual([
        expect.objectContaining({
          peerId: 'peer-1',
          batchId: 'batch-1',
          batchType: 'plate',
          eventIds: ['event-1'],
        }),
      ]);

      releaseFirst();
      await inFlight;

      expect(service.hasInFlightDeliveries()).toBe(false);
      expect(service.listInFlightDeliveries()).toEqual([]);
    });

    it('never tracks a batch rejected by the concurrency gate as in flight', async () => {
      const { service, callbackDriver } = buildService({ maxConcurrentPerPeer: 1 });

      let releaseFirst!: () => void;
      callbackDriver.deliver.mockImplementationOnce(
        () =>
          new Promise<void>((resolve) => {
            releaseFirst = resolve;
          }),
      );

      const first = service.deliver(buildBatch(), 'peer-1', 'plate');
      await service.deliver(buildBatch(), 'peer-1', 'plate');

      expect(service.listInFlightDeliveries()).toHaveLength(1);

      releaseFirst();
      await first;
    });
  });
});
