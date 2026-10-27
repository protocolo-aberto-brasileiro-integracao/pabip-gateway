import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import {
  INBOUND_RATE_LIMITER_QUOTA,
  OUTBOUND_RATE_LIMITER_QUOTA,
  PEERS_ACCESS_RATE_LIMITER_QUOTA,
  RateLimiterQuota,
} from './rate-limiter.constants';

export type RateLimiterDirection = 'in' | 'out';

export interface RateLimiterConsumeResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

type ConsumableLimiter = RateLimiterMemory | RateLimiterRedis;

@Injectable()
export class RateLimiterService implements OnModuleDestroy {
  private readonly logger = new Logger(RateLimiterService.name);
  private readonly redisClient?: Redis;
  private readonly inbound: ConsumableLimiter;
  private readonly outbound: ConsumableLimiter;
  private readonly peersAccess: ConsumableLimiter;

  constructor() {
    const redisUrl = process.env.GATEWAY_REDIS_URL ?? process.env.REDIS_URL;

    if (redisUrl) {
      const client = new Redis(redisUrl, {
        enableOfflineQueue: false,
        maxRetriesPerRequest: 1,
      });
      client.on('error', (error) =>
        this.logger.warn(
          `Rate limiter Redis connection error, failing open to in-memory limits: ${error.message}`,
        ),
      );

      this.redisClient = client;
      this.inbound = this.buildRedisLimiter(client, 'rl:in', INBOUND_RATE_LIMITER_QUOTA);
      this.outbound = this.buildRedisLimiter(client, 'rl:out', OUTBOUND_RATE_LIMITER_QUOTA);
      this.peersAccess = this.buildRedisLimiter(
        client,
        'rl:peers',
        PEERS_ACCESS_RATE_LIMITER_QUOTA,
      );
    } else {
      this.inbound = new RateLimiterMemory(INBOUND_RATE_LIMITER_QUOTA);
      this.outbound = new RateLimiterMemory(OUTBOUND_RATE_LIMITER_QUOTA);
      this.peersAccess = new RateLimiterMemory(PEERS_ACCESS_RATE_LIMITER_QUOTA);
    }
  }

  async consume(
    peerId: string,
    direction: RateLimiterDirection,
  ): Promise<RateLimiterConsumeResult> {
    return this.runLimiter(direction === 'in' ? this.inbound : this.outbound, peerId);
  }

  async consumePeersAccess(clientTokenId: string): Promise<RateLimiterConsumeResult> {
    return this.runLimiter(this.peersAccess, clientTokenId);
  }

  async onModuleDestroy(): Promise<void> {
    await this.redisClient?.quit();
  }

  private buildRedisLimiter(
    client: Redis,
    keyPrefix: string,
    quota: RateLimiterQuota,
  ): RateLimiterRedis {
    return new RateLimiterRedis({
      storeClient: client,
      keyPrefix,
      insuranceLimiter: new RateLimiterMemory(quota),
      ...quota,
    });
  }

  private async runLimiter(
    limiter: ConsumableLimiter,
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
