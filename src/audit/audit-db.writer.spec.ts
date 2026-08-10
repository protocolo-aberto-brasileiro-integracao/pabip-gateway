import { AuditDbWriter } from './audit-db.writer';
import type { AuditEvent } from './audit-event';

describe('AuditDbWriter', () => {
  it('creates one audit_log row per event, mapping category/action/peerId/detail/metadata', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const prisma = { auditLog: { create } };
    const writer = new AuditDbWriter(prisma as never);

    const event: AuditEvent = {
      category: 'delivery',
      action: 'delivery_failed',
      peerId: 'peer-1',
      detail: 'destination unreachable',
      metadata: { batchId: 'batch-1', batchType: 'plate', eventIds: ['event-1'], attempts: 3 },
    };

    await writer.write(event);

    expect(create).toHaveBeenCalledWith({
      data: {
        category: 'delivery',
        action: 'delivery_failed',
        peerId: 'peer-1',
        detail: 'destination unreachable',
        metadata: { batchId: 'batch-1', batchType: 'plate', eventIds: ['event-1'], attempts: 3 },
      },
    });
  });

  it('writes an event with no peerId/metadata as null/undefined rather than throwing', async () => {
    const create = jest.fn().mockResolvedValue(undefined);
    const prisma = { auditLog: { create } };
    const writer = new AuditDbWriter(prisma as never);

    const event: AuditEvent = {
      category: 'peer_store',
      action: 'peer_store_unavailable',
      detail: 'Peer registry database unreachable; serving cached peers only.',
    };

    await writer.write(event);

    expect(create).toHaveBeenCalledWith({
      data: {
        category: 'peer_store',
        action: 'peer_store_unavailable',
        peerId: undefined,
        detail: 'Peer registry database unreachable; serving cached peers only.',
        metadata: undefined,
      },
    });
  });
});
