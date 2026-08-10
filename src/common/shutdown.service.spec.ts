import { DrainingStateService } from '../health/draining-state.service';
import type { InFlightDelivery } from '../output-sink/output-sink.interface';
import { ShutdownService } from './shutdown.service';

function buildService(overrides: {
  inFlight?: InFlightDelivery[];
  drainsAfterFirstCheck?: boolean;
  auditSink?: { recordDeliveryEvent: jest.Mock };
}) {
  const drainingState = new DrainingStateService();
  let checkCount = 0;
  const outputSink = {
    hasInFlightDeliveries: jest.fn(() => {
      checkCount += 1;
      if (overrides.drainsAfterFirstCheck) {
        return checkCount === 1;
      }
      return (overrides.inFlight?.length ?? 0) > 0;
    }),
    listInFlightDeliveries: jest.fn(() =>
      overrides.drainsAfterFirstCheck ? [] : (overrides.inFlight ?? []),
    ),
  };

  const service = new ShutdownService(drainingState, outputSink as never, overrides.auditSink);

  return { service, drainingState, outputSink };
}

describe('ShutdownService', () => {
  it('beginDraining flips DrainingStateService immediately', () => {
    const { service, drainingState } = buildService({});
    expect(drainingState.isDraining()).toBe(false);
    service.beginDraining();
    expect(drainingState.isDraining()).toBe(true);
  });

  it('resolves immediately when there is nothing in flight', async () => {
    const { service, outputSink } = buildService({ inFlight: [] });
    await service.drainOutputSink(90);
    expect(outputSink.listInFlightDeliveries).toHaveBeenCalled();
  });

  it('does not audit anything once every in-flight delivery settles before the grace period ends', async () => {
    const recordDeliveryEvent = jest.fn();
    const { service } = buildService({
      drainsAfterFirstCheck: true,
      auditSink: { recordDeliveryEvent },
    });

    await service.drainOutputSink(5);

    expect(recordDeliveryEvent).not.toHaveBeenCalled();
  });

  it('audits every delivery still in flight as delivery_interrupted once the grace period is exhausted', async () => {
    const recordDeliveryEvent = jest.fn();
    const delivery: InFlightDelivery = {
      peerId: 'peer-1',
      batchId: 'batch-1',
      batchType: 'plate',
      eventIds: ['event-1'],
      attempts: 2,
    };
    const { service } = buildService({ inFlight: [delivery], auditSink: { recordDeliveryEvent } });

    await service.drainOutputSink(0.01);

    expect(recordDeliveryEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'delivery_interrupted',
        peerId: 'peer-1',
        batchId: 'batch-1',
        batchType: 'plate',
        eventIds: ['event-1'],
        attempts: 2,
      }),
    );
  });

  it('falls back to logging without throwing when no audit sink is bound', async () => {
    const delivery: InFlightDelivery = {
      peerId: 'peer-1',
      batchId: 'batch-1',
      batchType: 'plate',
      eventIds: ['event-1'],
      attempts: 1,
    };
    const { service } = buildService({ inFlight: [delivery] });

    await expect(service.drainOutputSink(0.01)).resolves.toBeUndefined();
  });
});
