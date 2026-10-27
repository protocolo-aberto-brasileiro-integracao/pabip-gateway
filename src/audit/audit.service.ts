import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../config/config.service';
import type { AuditSinkWriter, DeliveryAuditEvent } from '../output-sink/audit-sink.tokens';
import type { PeerStoreStatusListener } from '../peers/peer-store-status.tokens';
import type { AuditEvent } from './audit-event';
import { AuditDbWriter } from './audit-db.writer';
import { AuditStdoutWriter } from './audit-stdout.writer';

@Injectable()
export class AuditService implements AuditSinkWriter, PeerStoreStatusListener {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly stdoutWriter: AuditStdoutWriter,
    private readonly dbWriter: AuditDbWriter,
  ) {}

  record(event: AuditEvent): void {
    const writer = this.configService.audit.sink === 'db' ? this.dbWriter : this.stdoutWriter;
    writer.write(event).catch((error: unknown) => {
      this.logger.error(
        `Failed to write audit event (category=${event.category} action=${event.action}).`,
        error instanceof Error ? error.stack : String(error),
      );
    });
  }

  recordDeliveryEvent(event: DeliveryAuditEvent): void {
    this.record({
      category: 'delivery',
      action: event.reason,
      peerId: event.peerId,
      detail: event.detail,
      requestId: event.requestId,
      metadata: {
        batchId: event.batchId,
        batchType: event.batchType,
        eventIds: event.eventIds,
        attempts: event.attempts,
      },
    });
  }

  onPeerStoreAvailabilityChanged(available: boolean): void {
    this.record({
      category: 'peer_store',
      action: available ? 'peer_store_recovered' : 'peer_store_unavailable',
      detail: available
        ? 'Peer registry database reachable again.'
        : 'Peer registry database unreachable; serving cached peers only.',
    });
  }
}
