import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { withRetry } from '../common/retry.util';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import { ConfigService } from '../config/config.service';
import {
  AUDIT_SINK_WRITER,
  type AuditSinkWriter,
  type DeliveryAuditEvent,
} from './audit-sink.tokens';
import { ConcurrencyLimiter, PeerConcurrencyExceededError } from './concurrency-limiter';
import { DELIVERY_METRICS_RECORDER, type DeliveryMetricsRecorder } from './delivery-metrics.tokens';
import { CallbackDriver } from './drivers/callback.driver';
import { DbDriver } from './drivers/db.driver';
import { QueueDriver } from './drivers/queue.driver';
import type { DeliveryBatch, InFlightDelivery, OutputSinkDriver } from './output-sink.interface';

@Injectable()
export class OutputSinkService {
  private readonly logger = new Logger(OutputSinkService.name);
  private readonly inFlightDeliveries = new Map<number, InFlightDelivery>();
  private nextInFlightId = 0;

  constructor(
    private readonly configService: ConfigService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly concurrencyLimiter: ConcurrencyLimiter,
    private readonly callbackDriver: CallbackDriver,
    private readonly queueDriver: QueueDriver,
    private readonly dbDriver: DbDriver,
    @Optional() @Inject(AUDIT_SINK_WRITER) private readonly auditSink?: AuditSinkWriter,
    @Optional()
    @Inject(DELIVERY_METRICS_RECORDER)
    private readonly metricsRecorder?: DeliveryMetricsRecorder,
  ) {}

  async deliver(
    batch: DeliveryBatch,
    peerId: string,
    batchType: string,
    requestId?: string,
  ): Promise<void> {
    try {
      await this.concurrencyLimiter.run(peerId, () =>
        this.deliverWithRetry(batch, peerId, batchType),
      );
    } catch (error) {
      if (error instanceof PeerConcurrencyExceededError) {
        this.recordAudit({
          reason: 'peer_concurrency_exceeded',
          peerId,
          batchId: batch.batchId,
          batchType,
          eventIds: batch.events.map((event) => event.eventId),
          attempts: 0,
          detail: error.message,
          requestId,
        });
        return;
      }

      this.recordAudit({
        reason: 'delivery_failed',
        peerId,
        batchId: batch.batchId,
        batchType,
        eventIds: batch.events.map((event) => event.eventId),
        attempts: this.configService.retry.maxAttempts,
        detail: describeError(error),
        requestId,
      });
    }
  }

  private async deliverWithRetry(
    batch: DeliveryBatch,
    peerId: string,
    batchType: string,
  ): Promise<void> {
    const trackingId = this.beginTracking(peerId, batch, batchType);
    try {
      const driver = this.resolveDriver();
      const { maxAttempts, baseDelayMs, jitterPct } = this.configService.retry;

      await withRetry(
        () =>
          this.circuitBreaker.execute(peerId, 'sink', () =>
            driver.deliver(batch, peerId, batchType),
          ),
        {
          maxAttempts,
          baseDelayMs,
          jitterPct,
          onAttemptFailure: (error, attempt, nextDelayMs) => {
            this.updateTrackedAttempts(trackingId, attempt);
            this.logger.warn(
              `Delivery attempt ${attempt} failed for peer "${peerId}" batch "${batch.batchId}" ` +
                `(${describeError(error)}) — retrying in ~${Math.round(nextDelayMs)}ms.`,
              { peerId, batchId: batch.batchId },
            );
          },
        },
      );
    } finally {
      this.endTracking(trackingId);
    }
  }

  private beginTracking(peerId: string, batch: DeliveryBatch, batchType: string): number {
    const trackingId = this.nextInFlightId++;
    this.inFlightDeliveries.set(trackingId, {
      peerId,
      batchId: batch.batchId,
      batchType,
      eventIds: batch.events.map((event) => event.eventId),
      attempts: 1,
    });
    return trackingId;
  }

  private updateTrackedAttempts(trackingId: number, attempts: number): void {
    const tracked = this.inFlightDeliveries.get(trackingId);
    if (tracked) {
      tracked.attempts = attempts;
    }
  }

  private endTracking(trackingId: number): void {
    this.inFlightDeliveries.delete(trackingId);
  }

  hasInFlightDeliveries(): boolean {
    return this.inFlightDeliveries.size > 0;
  }

  listInFlightDeliveries(): InFlightDelivery[] {
    return [...this.inFlightDeliveries.values()];
  }

  private resolveDriver(): OutputSinkDriver {
    switch (this.configService.output.type) {
      case 'callback':
        return this.callbackDriver;
      case 'queue':
        return this.queueDriver;
      case 'db':
        return this.dbDriver;
    }
  }

  private recordAudit(event: DeliveryAuditEvent): void {
    if (this.auditSink) {
      this.auditSink.recordDeliveryEvent(event);
    } else {
      const summary =
        `peer=${event.peerId} batchId=${event.batchId} batchType=${event.batchType} ` +
        `events=${event.eventIds.length} attempts=${event.attempts} detail=${event.detail}`;
      if (event.reason === 'delivery_failed') {
        this.logger.error(`[audit] delivery_failed ${summary}`, {
          peerId: event.peerId,
          batchId: event.batchId,
        });
      } else {
        this.logger.warn(`[audit] peer_concurrency_exceeded ${summary}`, {
          peerId: event.peerId,
          batchId: event.batchId,
        });
      }
    }

    this.metricsRecorder?.recordDeliveryOutcome(event);
  }
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
