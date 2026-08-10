import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import * as amqplib from 'amqplib';
import { registerSecret } from '../../../common/logging/secret-redactor';
import { ConfigService } from '../../../config/config.service';
import type { DeliveryBatch } from '../../output-sink.interface';
import type { QueueSubDriver } from '../queue.driver';

const EXCHANGE_NAME = 'pabip.events';

@Injectable()
export class RabbitmqQueueDriver implements QueueSubDriver, OnModuleDestroy {
  private readonly logger = new Logger(RabbitmqQueueDriver.name);
  private brokerUrl?: string;
  private channelPromise?: Promise<amqplib.Channel>;
  private connection?: amqplib.ChannelModel;

  constructor(private readonly configService: ConfigService) {}

  async publish(
    batch: DeliveryBatch,
    peerId: string,
    batchType: string,
    routingKey: string,
  ): Promise<void> {
    const channel = await this.resolveChannel();
    const published = channel.publish(
      EXCHANGE_NAME,
      routingKey,
      Buffer.from(JSON.stringify(batch)),
      {
        contentType: 'application/json',
        persistent: true,
        messageId: batch.batchId,
        headers: { peerId, batchType },
      },
    );

    if (!published) {
      throw new Error(
        `RabbitMQ channel buffer is full publishing batch "${batch.batchId}" to exchange "${EXCHANGE_NAME}" (routing key "${routingKey}").`,
      );
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close().catch(() => undefined);
  }

  private resolveChannel(): Promise<amqplib.Channel> {
    const brokerUrl = this.configService.output.queue.brokerUrl;
    if (!brokerUrl) {
      throw new Error('output.queue.brokerUrl is not configured; cannot deliver via queue.');
    }
    if (this.channelPromise && this.brokerUrl === brokerUrl) {
      return this.channelPromise;
    }

    this.brokerUrl = brokerUrl;
    registerSecret(brokerUrl);
    this.channelPromise = this.connect(brokerUrl).catch((error: unknown) => {
      this.channelPromise = undefined;
      throw error;
    });
    return this.channelPromise;
  }

  private async connect(brokerUrl: string): Promise<amqplib.Channel> {
    const connection = await amqplib.connect(brokerUrl);
    connection.on('error', (error) =>
      this.logger.warn(`RabbitMQ connection error: ${error.message}`),
    );
    this.connection = connection;

    const channel = await connection.createChannel();
    await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
    this.logger.log(`Connected to RabbitMQ; asserted topic exchange "${EXCHANGE_NAME}".`);
    return channel;
  }
}
