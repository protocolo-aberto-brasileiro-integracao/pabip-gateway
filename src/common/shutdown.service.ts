import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { DrainingStateService } from '../health/draining-state.service';
import {
  AUDIT_SINK_WRITER,
  type AuditSinkWriter,
  type DeliveryAuditEvent,
} from '../output-sink/audit-sink.tokens';
import { OutputSinkService } from '../output-sink/output-sink.service';
import type { InFlightDelivery } from '../output-sink/output-sink.interface';

export const SHUTDOWN_DRAIN_POLL_INTERVAL_MS = 100;

@Injectable()
export class ShutdownService {
  private readonly logger = new Logger(ShutdownService.name);

  constructor(
    private readonly drainingState: DrainingStateService,
    private readonly outputSink: OutputSinkService,
    @Optional() @Inject(AUDIT_SINK_WRITER) private readonly auditSink?: AuditSinkWriter,
  ) {}

  beginDraining(): void {
    this.drainingState.setDraining(true);
  }

  async drainOutputSink(gracePeriodSeconds: number): Promise<void> {
    const deadlineAt = Date.now() + gracePeriodSeconds * 1000;
    while (this.outputSink.hasInFlightDeliveries() && Date.now() < deadlineAt) {
      await sleep(SHUTDOWN_DRAIN_POLL_INTERVAL_MS);
    }

    const stillInFlight = this.outputSink.listInFlightDeliveries();
    if (stillInFlight.length > 0) {
      this.logger.warn(
        `Shutdown grace period exhausted with ${stillInFlight.length} delivery(ies) still in flight — ` +
          'recording each as delivery_interrupted.',
      );
    }
    for (const delivery of stillInFlight) {
      this.recordInterrupted(delivery);
    }
  }

  private recordInterrupted(delivery: InFlightDelivery): void {
    const detail =
      `Delivery interrupted by shutdown grace period exhaustion ` +
      `(peer=${delivery.peerId}, batch=${delivery.batchId}, attempts=${delivery.attempts}).`;
    const event: DeliveryAuditEvent = {
      reason: 'delivery_interrupted',
      peerId: delivery.peerId,
      batchId: delivery.batchId,
      batchType: delivery.batchType,
      eventIds: delivery.eventIds,
      attempts: delivery.attempts,
      detail,
    };

    if (this.auditSink) {
      this.auditSink.recordDeliveryEvent(event);
    } else {
      this.logger.error(`[audit] delivery_interrupted ${detail}`);
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
