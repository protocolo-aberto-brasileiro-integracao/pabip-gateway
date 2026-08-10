export const AUDIT_SINK_WRITER = Symbol('AUDIT_SINK_WRITER');

export type DeliveryAuditReason =
  'delivery_failed' | 'peer_concurrency_exceeded' | 'delivery_interrupted';

export interface DeliveryAuditEvent {
  reason: DeliveryAuditReason;
  peerId: string;
  batchId: string;
  batchType: string;
  eventIds: string[];
  attempts: number;
  detail: string;
}

export interface AuditSinkWriter {
  recordDeliveryEvent(event: DeliveryAuditEvent): void;
}
