import { AuditService } from './audit.service';

function buildService(sink: 'stdout' | 'db') {
  const configService = { audit: { sink, retentionDays: 180 } };
  const stdoutWriter = { write: jest.fn().mockResolvedValue(undefined) };
  const dbWriter = { write: jest.fn().mockResolvedValue(undefined) };
  const service = new AuditService(
    configService as never,
    stdoutWriter as never,
    dbWriter as never,
  );
  return { service, stdoutWriter, dbWriter, configService };
}

describe('AuditService', () => {
  it('writes through the stdout writer when audit.sink = stdout', () => {
    const { service, stdoutWriter, dbWriter } = buildService('stdout');

    service.record({ category: 'peer_store', action: 'peer_store_unavailable', detail: 'x' });

    expect(stdoutWriter.write).toHaveBeenCalledTimes(1);
    expect(dbWriter.write).not.toHaveBeenCalled();
  });

  it('writes through the db writer when audit.sink = db', () => {
    const { service, stdoutWriter, dbWriter } = buildService('db');

    service.record({ category: 'peer_store', action: 'peer_store_unavailable', detail: 'x' });

    expect(dbWriter.write).toHaveBeenCalledTimes(1);
    expect(stdoutWriter.write).not.toHaveBeenCalled();
  });

  it('re-reads audit.sink on every call rather than caching it at construction', () => {
    const { service, stdoutWriter, dbWriter, configService } = buildService('stdout');

    service.record({ category: 'peer_store', action: 'peer_store_unavailable', detail: 'x' });
    configService.audit.sink = 'db';
    service.record({ category: 'peer_store', action: 'peer_store_recovered', detail: 'y' });

    expect(stdoutWriter.write).toHaveBeenCalledTimes(1);
    expect(dbWriter.write).toHaveBeenCalledTimes(1);
  });

  it('never throws when the underlying writer rejects', () => {
    const { service, stdoutWriter } = buildService('stdout');
    stdoutWriter.write.mockRejectedValue(new Error('disk full'));

    expect(() =>
      service.record({ category: 'peer_store', action: 'peer_store_unavailable', detail: 'x' }),
    ).not.toThrow();
  });

  it('recordDeliveryEvent() adapts a DeliveryAuditEvent into a delivery-category AuditEvent', () => {
    const { service, stdoutWriter } = buildService('stdout');

    service.recordDeliveryEvent({
      reason: 'delivery_failed',
      peerId: 'peer-1',
      batchId: 'batch-1',
      batchType: 'plate',
      eventIds: ['event-1'],
      attempts: 3,
      detail: 'destination unreachable',
    });

    expect(stdoutWriter.write).toHaveBeenCalledWith({
      category: 'delivery',
      action: 'delivery_failed',
      peerId: 'peer-1',
      detail: 'destination unreachable',
      metadata: { batchId: 'batch-1', batchType: 'plate', eventIds: ['event-1'], attempts: 3 },
    });
  });

  it('onPeerStoreAvailabilityChanged(false) records peer_store_unavailable', () => {
    const { service, stdoutWriter } = buildService('stdout');

    service.onPeerStoreAvailabilityChanged(false);

    expect(stdoutWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'peer_store', action: 'peer_store_unavailable' }),
    );
  });

  it('onPeerStoreAvailabilityChanged(true) records peer_store_recovered', () => {
    const { service, stdoutWriter } = buildService('stdout');

    service.onPeerStoreAvailabilityChanged(true);

    expect(stdoutWriter.write).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'peer_store', action: 'peer_store_recovered' }),
    );
  });
});
