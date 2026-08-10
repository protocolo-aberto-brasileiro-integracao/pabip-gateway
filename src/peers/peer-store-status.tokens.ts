export const PEER_STORE_STATUS_LISTENER = Symbol('PEER_STORE_STATUS_LISTENER');

export interface PeerStoreStatusListener {
  onPeerStoreAvailabilityChanged(available: boolean): void;
}
