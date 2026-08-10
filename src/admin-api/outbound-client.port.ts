export type {
  RecordingsCatalog,
  SensorNodeListing,
  VideoSession,
  VideoSessionRequest,
} from '@protocolo-aberto-brasileiro-integracao/pabip-sdk';
import type {
  RecordingsCatalog,
  SensorNodeListing,
  VideoSession,
  VideoSessionRequest,
} from '@protocolo-aberto-brasileiro-integracao/pabip-sdk';

export const OUTBOUND_CLIENT = Symbol('OUTBOUND_CLIENT');

export interface OutboundClientPort {
  listSensorNodes(peerId: string, page?: number, pageSize?: number): Promise<SensorNodeListing>;
  getSensorNode(peerId: string, nodeId: string): Promise<unknown>;
  createVideoSession(
    peerId: string,
    nodeId: string,
    body: VideoSessionRequest,
  ): Promise<VideoSession>;
  getRecordings(peerId: string, nodeId: string): Promise<RecordingsCatalog>;
  getImageAnalyticsEvent(peerId: string, eventId: string): Promise<unknown>;
}
