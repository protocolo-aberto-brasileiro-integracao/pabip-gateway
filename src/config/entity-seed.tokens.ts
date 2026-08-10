export const PEER_SEED_WRITER = Symbol('PEER_SEED_WRITER');

export interface PeerSeedWriter {
  seedPeers(peers: Record<string, unknown>[]): Promise<void>;
}

export const ADMIN_TOKEN_SEED_WRITER = Symbol('ADMIN_TOKEN_SEED_WRITER');

export interface AdminTokenSeedWriter {
  seedAdminTokens(tokens: string[]): Promise<void>;
}
