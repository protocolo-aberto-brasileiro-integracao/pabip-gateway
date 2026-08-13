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
  private channelPromise?: Promise<amqplib.ConfirmChannel>;
  private connection?: amqplib.ChannelModel;
  // Populated by the channel's 'return' listener when the broker hands a mandatory
  // message back as unroutable — checked from the confirm callback for the same
  // messageId, since RabbitMQ always sends the return before the ack/nack.
  private readonly returnedMessageIds = new Set<string>();

  constructor(private readonly configService: ConfigService) {}

  async publish(
    batch: DeliveryBatch,
    peerId: string,
    batchType: string,
    routingKey: string,
  ): Promise<void> {
    const channel = await this.resolveChannel();
    const messageId = batch.batchId;
    this.returnedMessageIds.delete(messageId);

    await new Promise<void>((resolve, reject) => {
      const published = channel.publish(
        EXCHANGE_NAME,
        routingKey,
        Buffer.from(JSON.stringify(batch)),
        {
          contentType: 'application/json',
          persistent: true,
          mandatory: true,
          messageId,
          headers: { peerId, batchType },
        },
        (error: Error | null) => {
          if (error) {
            reject(
              new Error(
                `RabbitMQ nacked batch "${messageId}" on exchange "${EXCHANGE_NAME}" (routing key "${routingKey}"): ${error.message}`,
              ),
            );
            return;
          }
          if (this.returnedMessageIds.delete(messageId)) {
            reject(
              new Error(
                `Batch "${messageId}" was unroutable on exchange "${EXCHANGE_NAME}" (routing key "${routingKey}") — no queue is bound to receive it.`,
              ),
            );
            return;
          }
          resolve();
        },
      );

      if (!published) {
        reject(
          new Error(
            `RabbitMQ channel buffer is full publishing batch "${messageId}" to exchange "${EXCHANGE_NAME}" (routing key "${routingKey}").`,
          ),
        );
      }
    });
  }

  async onModuleDestroy(): Promise<void> {
    await this.connection?.close().catch(() => undefined);
  }

  private resolveChannel(): Promise<amqplib.ConfirmChannel> {
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

  private async connect(brokerUrl: string): Promise<amqplib.ConfirmChannel> {
    const connection = await amqplib.connect(brokerUrl);
    connection.on('error', (error) =>
      this.logger.warn(`RabbitMQ connection error: ${error.message}`),
    );
    connection.on('close', () => {
      this.logger.warn('RabbitMQ connection closed; will reconnect on the next delivery.');
      this.invalidateConnection();
    });
    this.connection = connection;

    const channel = await connection.createConfirmChannel();
    channel.on('close', () => {
      this.logger.warn('RabbitMQ channel closed; will reconnect on the next delivery.');
      this.invalidateConnection();
    });
    channel.on('return', (msg) => {
      const messageId = msg.properties?.messageId as string | undefined;
      if (messageId) {
        this.returnedMessageIds.add(messageId);
      }
      this.logger.warn(
        `RabbitMQ returned an unroutable message (routing key "${msg.fields.routingKey}", messageId "${messageId ?? 'unknown'}") — no queue is bound for it.`,
      );
    });

    await channel.assertExchange(EXCHANGE_NAME, 'topic', { durable: true });
    this.logger.log(`Connected to RabbitMQ; asserted topic exchange "${EXCHANGE_NAME}".`);
    return channel;
  }

  // Called when the connection or channel closes for any reason (broker restart,
  // network blip, etc.) so the next delivery reconnects instead of reusing a dead
  // channel forever — see resolveChannel().
  private invalidateConnection(): void {
    this.channelPromise = undefined;
    this.connection = undefined;
  }
}
