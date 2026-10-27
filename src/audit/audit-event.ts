export type AuditCategory = 'delivery' | 'peer_store' | 'access';

export type DeliveryAuditAction =
  'delivery_failed' | 'peer_concurrency_exceeded' | 'delivery_interrupted';

export interface DeliveryAuditEntry {
  category: 'delivery';
  action: DeliveryAuditAction;
  peerId: string;
  detail: string;
  requestId?: string;
  metadata: {
    batchId: string;
    batchType: string;
    eventIds: string[];
    attempts: number;
  };
}

export type PeerStoreAuditAction = 'peer_store_unavailable' | 'peer_store_recovered';

export interface PeerStoreAuditEntry {
  category: 'peer_store';
  action: PeerStoreAuditAction;
  peerId?: undefined;
  detail: string;
  metadata?: undefined;
}

export type AccessAuditAction = 'image_analytics_read';

export interface AccessAuditEntry {
  category: 'access';
  action: AccessAuditAction;
  peerId: string;
  detail: string;
  requestId?: string;
  actorId?: string;
  caseRef?: string;
  metadata?: Record<string, unknown>;
}

export type AuditEvent = DeliveryAuditEntry | PeerStoreAuditEntry | AccessAuditEntry;
