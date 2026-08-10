import { QueueDriver, renderRoutingKeyTemplate } from './queue.driver';
import type { DeliveryBatch } from '../output-sink.interface';

function buildBatch(): DeliveryBatch {
  return {
    batchId: 'batch-1',
    batchTime: '2026-05-08T14:00:00-03:00',
    batchCount: 0,
    batchType: 'plate',
    events: [],
  };
}

function buildDriver(brokerUrl: string) {
  const configService = {
    output: { queue: { brokerUrl, routingKeyTemplate: 'pabip.events.{peerId}.{batchType}' } },
  } as never;
  const rabbitmq = { publish: jest.fn().mockResolvedValue(undefined) };
  const kafka = { publish: jest.fn().mockResolvedValue(undefined) };
  const sqs = { publish: jest.fn().mockResolvedValue(undefined) };
  const redisStreams = { publish: jest.fn().mockResolvedValue(undefined) };
  const driver = new QueueDriver(
    configService,
    rabbitmq as never,
    kafka as never,
    sqs as never,
    redisStreams as never,
  );
  return { driver, rabbitmq, kafka, sqs, redisStreams };
}

describe('renderRoutingKeyTemplate', () => {
  it('interpolates peerId and batchType', () => {
    expect(renderRoutingKeyTemplate('pabip.events.{peerId}.{batchType}', 'acme', 'plate')).toBe(
      'pabip.events.acme.plate',
    );
  });
});

describe('QueueDriver', () => {
  it('throws when output.queue.brokerUrl is not configured', async () => {
    const { driver } = buildDriver('');
    await expect(driver.deliver(buildBatch(), 'acme', 'plate')).rejects.toThrow(
      /output.queue.brokerUrl is not configured/,
    );
  });

  it('routes amqp:// to the RabbitMQ sub-driver', async () => {
    const { driver, rabbitmq } = buildDriver('amqp://guest:guest@localhost:5672');
    await driver.deliver(buildBatch(), 'acme', 'plate');
    expect(rabbitmq.publish).toHaveBeenCalledWith(
      expect.objectContaining({ batchId: 'batch-1' }),
      'acme',
      'plate',
      'pabip.events.acme.plate',
    );
  });

  it('routes amqps:// to the RabbitMQ sub-driver', async () => {
    const { driver, rabbitmq } = buildDriver('amqps://guest:guest@localhost:5671');
    await driver.deliver(buildBatch(), 'acme', 'plate');
    expect(rabbitmq.publish).toHaveBeenCalled();
  });

  it('routes redis:// to the Redis Streams sub-driver', async () => {
    const { driver, redisStreams } = buildDriver('redis://localhost:6379');
    await driver.deliver(buildBatch(), 'acme', 'plate');
    expect(redisStreams.publish).toHaveBeenCalled();
  });

  it('routes kafka:// to the Kafka sub-driver', async () => {
    const { driver, kafka } = buildDriver('kafka://broker-1:9092,broker-2:9092');
    await driver.deliver(buildBatch(), 'acme', 'plate');
    expect(kafka.publish).toHaveBeenCalled();
  });

  it('routes https:// to the SQS sub-driver', async () => {
    const { driver, sqs } = buildDriver(
      'https://sqs.us-east-1.amazonaws.com/123456789012/pabip-events',
    );
    await driver.deliver(buildBatch(), 'acme', 'plate');
    expect(sqs.publish).toHaveBeenCalled();
  });

  it('throws for an unrecognized scheme', async () => {
    const { driver } = buildDriver('ftp://localhost');
    await expect(driver.deliver(buildBatch(), 'acme', 'plate')).rejects.toThrow(
      /unrecognized scheme/,
    );
  });
});
