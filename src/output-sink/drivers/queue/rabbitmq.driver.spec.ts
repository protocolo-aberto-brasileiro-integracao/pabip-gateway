const mockPublish = jest.fn().mockReturnValue(true);
const mockAssertExchange = jest.fn().mockResolvedValue(undefined);
const mockCreateChannel = jest.fn().mockResolvedValue({
  publish: mockPublish,
  assertExchange: mockAssertExchange,
});
const mockConnectionOn = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({
  createChannel: mockCreateChannel,
  on: mockConnectionOn,
  close: jest.fn().mockResolvedValue(undefined),
});

jest.mock('amqplib', () => ({ connect: mockConnect }));

import { RabbitmqQueueDriver } from './rabbitmq.driver';
import type { DeliveryBatch } from '../../output-sink.interface';

function buildBatch(): DeliveryBatch {
  return { batchId: 'batch-1', batchTime: 't', batchCount: 0, batchType: 'plate', events: [] };
}

describe('RabbitmqQueueDriver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPublish.mockReturnValue(true);
  });

  it('connects, asserts the topic exchange, and publishes with the routing key', async () => {
    const configService = {
      output: { queue: { brokerUrl: 'amqp://guest:guest@localhost:5672' } },
    } as never;
    const driver = new RabbitmqQueueDriver(configService);

    await driver.publish(buildBatch(), 'acme', 'plate', 'pabip.events.acme.plate');

    expect(mockConnect).toHaveBeenCalledWith('amqp://guest:guest@localhost:5672');
    expect(mockAssertExchange).toHaveBeenCalledWith('pabip.events', 'topic', { durable: true });
    expect(mockPublish).toHaveBeenCalledWith(
      'pabip.events',
      'pabip.events.acme.plate',
      Buffer.from(JSON.stringify(buildBatch())),
      expect.objectContaining({ persistent: true, messageId: 'batch-1' }),
    );
  });

  it('reuses the cached channel across calls with the same brokerUrl', async () => {
    const configService = { output: { queue: { brokerUrl: 'amqp://localhost' } } } as never;
    const driver = new RabbitmqQueueDriver(configService);

    await driver.publish(buildBatch(), 'acme', 'plate', 'rk');
    await driver.publish(buildBatch(), 'acme', 'plate', 'rk');

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockPublish).toHaveBeenCalledTimes(2);
  });

  it('throws when the channel buffer reports it is full', async () => {
    mockPublish.mockReturnValueOnce(false);
    const configService = { output: { queue: { brokerUrl: 'amqp://localhost' } } } as never;
    const driver = new RabbitmqQueueDriver(configService);

    await expect(driver.publish(buildBatch(), 'acme', 'plate', 'rk')).rejects.toThrow(
      /buffer is full/,
    );
  });
});
