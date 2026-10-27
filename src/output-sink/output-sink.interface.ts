export type {
  DeliveryBatch,
  OutputSinkDriver,
} from '@protocolo-aberto-brasileiro-integracao/pabip-sdk';

export interface InFlightDelivery {
  peerId: string;
  batchId: string;
  batchType: string;
  eventIds: string[];
  attempts: number;
}
