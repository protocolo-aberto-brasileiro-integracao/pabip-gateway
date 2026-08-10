import type { DeliveryAuditEvent } from './audit-sink.tokens';

export const DELIVERY_METRICS_RECORDER = Symbol('DELIVERY_METRICS_RECORDER');

export interface DeliveryMetricsRecorder {
  recordDeliveryOutcome(event: DeliveryAuditEvent): void;
}
