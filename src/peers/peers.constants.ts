export const PEERS_CHANGED_CHANNEL = 'peers_changed';

export const PEERS_POLL_INTERVAL_MS = 5_000;

export const PEER_SCOPES = ['plate:write', 'face:write'] as const;
export type PeerScope = (typeof PEER_SCOPES)[number];
