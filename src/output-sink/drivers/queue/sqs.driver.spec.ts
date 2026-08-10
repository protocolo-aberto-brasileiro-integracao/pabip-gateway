const mockSend = jest.fn().mockResolvedValue({});

jest.mock('@aws-sdk/client-sqs', () => ({
  SQSClient: jest.fn().mockImplementation(() => ({ send: mockSend })),
  SendMessageCommand: jest.fn().mockImplementation((input: unknown) => ({ input })),
}));

import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import { SqsQueueDriver, resolveRegionFromQueueUrl } from './sqs.driver';
import type { DeliveryBatch } from '../../output-sink.interface';

function buildBatch(): DeliveryBatch {
  return { batchId: 'batch-1', batchTime: 't', batchCount: 0, batchType: 'plate', events: [] };
}

describe('resolveRegionFromQueueUrl', () => {
  it('extracts the region from a standard SQS queue URL', () => {
    expect(
      resolveRegionFromQueueUrl('https://sqs.sa-east-1.amazonaws.com/123456789012/queue'),
    ).toBe('sa-east-1');
  });

  it('falls back to AWS_REGION when the URL does not match the SQS shape', () => {
    const previous = process.env.AWS_REGION;
    process.env.AWS_REGION = 'eu-west-1';
    expect(resolveRegionFromQueueUrl('https://localstack:4566/000000000000/queue')).toBe(
      'eu-west-1',
    );
    if (previous === undefined) {
      delete process.env.AWS_REGION;
    } else {
      process.env.AWS_REGION = previous;
    }
  });
});

describe('SqsQueueDriver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('sends the whole batch as the message body with peer/batchType/routingKey attributes', async () => {
    const configService = {
      output: {
        queue: { brokerUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/pabip-events' },
      },
    } as never;
    const driver = new SqsQueueDriver(configService);

    await driver.publish(buildBatch(), 'acme', 'plate', 'pabip.events.acme.plate');

    expect(SQSClient).toHaveBeenCalledWith({ region: 'us-east-1' });
    expect(SendMessageCommand).toHaveBeenCalledTimes(1);
    const [input] = (SendMessageCommand as unknown as jest.Mock).mock.calls[0] as [
      {
        QueueUrl: string;
        MessageBody: string;
        MessageAttributes: Record<string, { DataType: string; StringValue: string }>;
      },
    ];
    expect(input.QueueUrl).toBe('https://sqs.us-east-1.amazonaws.com/123456789012/pabip-events');
    expect(input.MessageBody).toBe(JSON.stringify(buildBatch()));
    expect(input.MessageAttributes).toMatchObject({
      peerId: { DataType: 'String', StringValue: 'acme' },
      batchType: { DataType: 'String', StringValue: 'plate' },
      routingKey: { DataType: 'String', StringValue: 'pabip.events.acme.plate' },
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('reuses the cached client across calls with the same queue URL', async () => {
    const configService = {
      output: {
        queue: { brokerUrl: 'https://sqs.us-east-1.amazonaws.com/123456789012/pabip-events' },
      },
    } as never;
    const driver = new SqsQueueDriver(configService);

    await driver.publish(buildBatch(), 'acme', 'plate', 'rk');
    await driver.publish(buildBatch(), 'acme', 'plate', 'rk');

    expect(SQSClient).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });
});
