import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import type { DeliveryBatch, OutputSinkDriver } from '../output-sink.interface';
import { KafkaQueueDriver } from './queue/kafka.driver';
import { RabbitmqQueueDriver } from './queue/rabbitmq.driver';
import { RedisStreamsQueueDriver } from './queue/redis-streams.driver';
import { SqsQueueDriver } from './queue/sqs.driver';

export interface QueueSubDriver {
  publish(
    batch: DeliveryBatch,
    peerId: string,
    batchType: string,
    routingKey: string,
  ): Promise<void>;
}

@Injectable()
export class QueueDriver implements OutputSinkDriver {
  constructor(
    private readonly configService: ConfigService,
    private readonly rabbitmq: RabbitmqQueueDriver,
    private readonly kafka: KafkaQueueDriver,
    private readonly sqs: SqsQueueDriver,
    private readonly redisStreams: RedisStreamsQueueDriver,
  ) {}

  async deliver(batch: DeliveryBatch, peerId: string, batchType: string): Promise<void> {
    const { brokerUrl, routingKeyTemplate } = this.configService.output.queue;
    if (!brokerUrl) {
      throw new Error('output.queue.brokerUrl is not configured; cannot deliver via queue.');
    }

    const routingKey = renderRoutingKeyTemplate(routingKeyTemplate, peerId, batchType);
    const subDriver = this.selectSubDriver(brokerUrl);
    await subDriver.publish(batch, peerId, batchType, routingKey);
  }

  private selectSubDriver(brokerUrl: string): QueueSubDriver {
    if (/^amqps?:\/\//i.test(brokerUrl)) {
      return this.rabbitmq;
    }
    if (/^rediss?:\/\//i.test(brokerUrl)) {
      return this.redisStreams;
    }
    if (/^kafka:\/\//i.test(brokerUrl)) {
      return this.kafka;
    }
    if (/^https:\/\//i.test(brokerUrl)) {
      return this.sqs;
    }

    throw new Error(
      `output.queue.brokerUrl "${brokerUrl}" has an unrecognized scheme — expected amqp(s)://, redis(s)://, kafka://, or https:// (SQS).`,
    );
  }
}

export function renderRoutingKeyTemplate(
  template: string,
  peerId: string,
  batchType: string,
): string {
  return template.split('{peerId}').join(peerId).split('{batchType}').join(batchType);
}
