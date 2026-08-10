import { Injectable } from '@nestjs/common';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import {
  INBOUND_RATE_LIMITER_QUOTA,
  OUTBOUND_RATE_LIMITER_QUOTA,
  PEERS_ACCESS_RATE_LIMITER_QUOTA,
} from './rate-limiter.constants';

export type RateLimiterDirection = 'in' | 'out';

export interface RateLimiterConsumeResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

@Injectable()
export class RateLimiterService {
  private readonly inbound = new RateLimiterMemory(INBOUND_RATE_LIMITER_QUOTA);
  private readonly outbound = new RateLimiterMemory(OUTBOUND_RATE_LIMITER_QUOTA);
  private readonly peersAccess = new RateLimiterMemory(PEERS_ACCESS_RATE_LIMITER_QUOTA);

  async consume(
    peerId: string,
    direction: RateLimiterDirection,
  ): Promise<RateLimiterConsumeResult> {
    return this.runLimiter(direction === 'in' ? this.inbound : this.outbound, peerId);
  }

  async consumePeersAccess(clientTokenId: string): Promise<RateLimiterConsumeResult> {
    return this.runLimiter(this.peersAccess, clientTokenId);
  }

  private async runLimiter(
    limiter: RateLimiterMemory,
    key: string,
  ): Promise<RateLimiterConsumeResult> {
    try {
      await limiter.consume(key);
      return { allowed: true };
    } catch (rejection) {
      if (rejection instanceof RateLimiterRes) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil(rejection.msBeforeNext / 1000)),
        };
      }

      throw rejection;
    }
  }
}
