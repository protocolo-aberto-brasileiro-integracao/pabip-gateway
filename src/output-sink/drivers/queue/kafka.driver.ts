import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Kafka, type Producer } from 'kafkajs';
import { ConfigService } from '../../../config/config.service';
import type { DeliveryBatch } from '../../output-sink.interface';
import type { QueueSubDriver } from '../queue.driver';

const KAFKA_TOPIC = 'pabip.events';

@Injectable()
export class KafkaQueueDriver implements QueueSubDriver, OnModuleDestroy {
  private readonly logger = new Logger(KafkaQueueDriver.name);
  private brokerUrl?: string;
  private producerPromise?: Promise<Producer>;

  constructor(private readonly configService: ConfigService) {}

  async publish(
    batch: DeliveryBatch,
    peerId: string,
    batchType: string,
    routingKey: string,
  ): Promise<void> {
    const producer = await this.resolveProducer();
    await producer.send({
      topic: KAFKA_TOPIC,
      messages: [
        {
          key: routingKey,
          value: JSON.stringify(batch),
          headers: { peerId, batchType },
        },
      ],
    });
  }

  async onModuleDestroy(): Promise<void> {
    const producer = await this.producerPromise?.catch(() => undefined);
    await producer?.disconnect().catch(() => undefined);
  }

  private resolveProducer(): Promise<Producer> {
    const brokerUrl = this.configService.output.queue.brokerUrl;
    if (!brokerUrl) {
      throw new Error('output.queue.brokerUrl is not configured; cannot deliver via queue.');
    }
    if (this.producerPromise && this.brokerUrl === brokerUrl) {
      return this.producerPromise;
    }

    this.brokerUrl = brokerUrl;
    this.producerPromise = this.connect(brokerUrl).catch((error: unknown) => {
      this.producerPromise = undefined;
      throw error;
    });
    return this.producerPromise;
  }

  private async connect(brokerUrl: string): Promise<Producer> {
    const brokers = parseKafkaBrokers(brokerUrl);
    const kafka = new Kafka({ clientId: 'pabip-gateway', brokers });
    const producer = kafka.producer();
    await producer.connect();
    this.logger.log(`Connected Kafka producer to ${brokers.join(', ')}; topic "${KAFKA_TOPIC}".`);
    return producer;
  }
}

export function parseKafkaBrokers(brokerUrl: string): string[] {
  const brokers = brokerUrl
    .replace(/^kafka:\/\//i, '')
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);

  if (brokers.length === 0) {
    throw new Error(
      `output.queue.brokerUrl "${brokerUrl}" has no broker host:port entries after the "kafka://" prefix.`,
    );
  }

  return brokers;
}
