export class PeerUnreachableError extends Error {
  readonly code = 'peer_unreachable';

  constructor(message: string, cause?: unknown) {
    super(message, { cause });
    this.name = 'PeerUnreachableError';
  }
}
