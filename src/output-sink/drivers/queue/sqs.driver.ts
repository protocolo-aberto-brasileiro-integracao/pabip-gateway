import { Injectable, Logger } from '@nestjs/common';
import { SendMessageCommand, SQSClient } from '@aws-sdk/client-sqs';
import { ConfigService } from '../../../config/config.service';
import type { DeliveryBatch } from '../../output-sink.interface';
import type { QueueSubDriver } from '../queue.driver';

@Injectable()
export class SqsQueueDriver implements QueueSubDriver {
  private readonly logger = new Logger(SqsQueueDriver.name);
  private queueUrl?: string;
  private client?: SQSClient;

  constructor(private readonly configService: ConfigService) {}

  async publish(
    batch: DeliveryBatch,
    peerId: string,
    batchType: string,
    routingKey: string,
  ): Promise<void> {
    const { client, queueUrl } = this.resolveClient();
    await client.send(
      new SendMessageCommand({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify(batch),
        MessageAttributes: {
          peerId: { DataType: 'String', StringValue: peerId },
          batchType: { DataType: 'String', StringValue: batchType },
          routingKey: { DataType: 'String', StringValue: routingKey },
        },
      }),
    );
  }

  private resolveClient(): { client: SQSClient; queueUrl: string } {
    const queueUrl = this.configService.output.queue.brokerUrl;
    if (!queueUrl) {
      throw new Error('output.queue.brokerUrl is not configured; cannot deliver via queue.');
    }

    if (this.client && this.queueUrl === queueUrl) {
      return { client: this.client, queueUrl };
    }

    this.queueUrl = queueUrl;
    this.client = new SQSClient({ region: resolveRegionFromQueueUrl(queueUrl) });
    this.logger.log(`Configured SQS client for "${queueUrl}".`);
    return { client: this.client, queueUrl };
  }
}

export function resolveRegionFromQueueUrl(queueUrl: string): string {
  const match = /^https:\/\/sqs\.([^.]+)\./i.exec(queueUrl);
  return match?.[1] ?? process.env.AWS_REGION ?? process.env.AWS_DEFAULT_REGION ?? 'us-east-1';
}
