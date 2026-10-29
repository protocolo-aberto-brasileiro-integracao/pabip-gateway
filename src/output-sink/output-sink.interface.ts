import type { DeliveryBatch } from '@protocolo-aberto-brasileiro-integracao/pabip-sdk';

export type { DeliveryBatch } from '@protocolo-aberto-brasileiro-integracao/pabip-sdk';

export interface OutputSinkDriver {
  deliver(
    batch: DeliveryBatch,
    peerId: string,
    batchType: string,
    requestId?: string,
  ): Promise<void>;
}

export interface InFlightDelivery {
  peerId: string;
  batchId: string;
  batchType: string;
  eventIds: string[];
  attempts: number;
}
