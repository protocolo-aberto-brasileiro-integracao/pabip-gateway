import { AuditStdoutWriter } from './audit-stdout.writer';
import type { AuditEvent } from './audit-event';

describe('AuditStdoutWriter', () => {
  it('resolves without throwing for a delivery event', async () => {
    const writer = new AuditStdoutWriter();
    const event: AuditEvent = {
      category: 'delivery',
      action: 'delivery_failed',
      peerId: 'peer-1',
      detail: 'destination unreachable',
      metadata: { batchId: 'batch-1', batchType: 'plate', eventIds: ['event-1'], attempts: 3 },
    };

    await expect(writer.write(event)).resolves.toBeUndefined();
  });

  it('resolves without throwing for a peer_store event with no peerId/metadata', async () => {
    const writer = new AuditStdoutWriter();
    const event: AuditEvent = {
      category: 'peer_store',
      action: 'peer_store_recovered',
      detail: 'Peer registry database reachable again.',
    };

    await expect(writer.write(event)).resolves.toBeUndefined();
  });
});
