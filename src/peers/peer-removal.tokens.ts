export const PEER_REMOVAL_LISTENER = Symbol('PEER_REMOVAL_LISTENER');

export interface PeerRemovalListener {
  onPeerRemoved(peerId: string): void;
}
