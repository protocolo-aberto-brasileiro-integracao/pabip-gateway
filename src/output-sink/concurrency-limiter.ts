import { Injectable } from '@nestjs/common';
import { ConfigService } from '../config/config.service';

export class PeerConcurrencyExceededError extends Error {
  constructor(
    public readonly peerId: string,
    public readonly limit: number,
  ) {
    super(
      `Peer "${peerId}" already has ${limit} batch(es) in flight (delivery.maxConcurrentPerPeer).`,
    );
    this.name = 'PeerConcurrencyExceededError';
  }
}

@Injectable()
export class ConcurrencyLimiter {
  private readonly inFlight = new Map<string, number>();

  constructor(private readonly configService: ConfigService) {}

  async run<T>(peerId: string, fn: () => Promise<T>): Promise<T> {
    const limit = this.configService.delivery.maxConcurrentPerPeer;
    const current = this.inFlight.get(peerId) ?? 0;
    if (current >= limit) {
      throw new PeerConcurrencyExceededError(peerId, limit);
    }

    this.inFlight.set(peerId, current + 1);
    try {
      return await fn();
    } finally {
      const remaining = (this.inFlight.get(peerId) ?? 1) - 1;
      if (remaining <= 0) {
        this.inFlight.delete(peerId);
      } else {
        this.inFlight.set(peerId, remaining);
      }
    }
  }

  getInFlightCount(peerId: string): number {
    return this.inFlight.get(peerId) ?? 0;
  }
}
