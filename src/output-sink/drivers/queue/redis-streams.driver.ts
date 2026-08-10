import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';
import { registerSecret } from '../../../common/logging/secret-redactor';
import { ConfigService } from '../../../config/config.service';
import type { DeliveryBatch } from '../../output-sink.interface';
import type { QueueSubDriver } from '../queue.driver';

@Injectable()
export class RedisStreamsQueueDriver implements QueueSubDriver, OnModuleDestroy {
  private readonly logger = new Logger(RedisStreamsQueueDriver.name);
  private brokerUrl?: string;
  private client?: Redis;

  constructor(private readonly configService: ConfigService) {}

  async publish(
    batch: DeliveryBatch,
    peerId: string,
    batchType: string,
    routingKey: string,
  ): Promise<void> {
    const client = this.resolveClient();
    await client.xadd(
      routingKey,
      '*',
      'peerId',
      peerId,
      'batchType',
      batchType,
      'batchId',
      batch.batchId,
      'payload',
      JSON.stringify(batch),
    );
  }

  onModuleDestroy(): void {
    this.client?.disconnect();
  }

  private resolveClient(): Redis {
    const brokerUrl = this.configService.output.queue.brokerUrl;
    if (!brokerUrl) {
      throw new Error('output.queue.brokerUrl is not configured; cannot deliver via queue.');
    }
    if (this.client && this.brokerUrl === brokerUrl) {
      return this.client;
    }

    this.brokerUrl = brokerUrl;
    registerSecret(brokerUrl);
    this.client?.disconnect();
    this.client = new Redis(brokerUrl, { maxRetriesPerRequest: 1 });
    this.client.on('error', (error) =>
      this.logger.warn(`Redis Streams connection error: ${error.message}`),
    );
    this.logger.log(`Connected to Redis for Streams publishing.`);
    return this.client;
  }
}
