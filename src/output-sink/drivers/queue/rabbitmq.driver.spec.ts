type PublishCallback = (error: Error | null) => void;
type PublishArgs = [
  exchange: string,
  routingKey: string,
  buffer: Buffer,
  options: unknown,
  callback?: PublishCallback,
];

const mockPublish = jest.fn((...args: PublishArgs) => {
  args[4]?.(null);
  return true;
});
const mockAssertExchange = jest.fn().mockResolvedValue(undefined);
const channelListeners: Record<string, (...args: never[]) => void> = {};
const mockChannelOn = jest.fn((event: string, handler: (...args: never[]) => void) => {
  channelListeners[event] = handler;
});
const mockCreateConfirmChannel = jest.fn().mockResolvedValue({
  publish: mockPublish,
  assertExchange: mockAssertExchange,
  on: mockChannelOn,
});
const connectionListeners: Record<string, (...args: never[]) => void> = {};
const mockConnectionOn = jest.fn((event: string, handler: (...args: never[]) => void) => {
  connectionListeners[event] = handler;
});
const mockConnect = jest.fn().mockResolvedValue({
  createConfirmChannel: mockCreateConfirmChannel,
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
    for (const key of Object.keys(channelListeners)) delete channelListeners[key];
    for (const key of Object.keys(connectionListeners)) delete connectionListeners[key];
    mockPublish.mockImplementation((...args: PublishArgs) => {
      args[4]?.(null);
      return true;
    });
  });

  it('connects, asserts the topic exchange, and publishes with the routing key and mandatory flag', async () => {
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
      expect.objectContaining({ persistent: true, mandatory: true, messageId: 'batch-1' }),
      expect.any(Function),
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
    mockPublish.mockImplementationOnce(() => false);
    const configService = { output: { queue: { brokerUrl: 'amqp://localhost' } } } as never;
    const driver = new RabbitmqQueueDriver(configService);

    await expect(driver.publish(buildBatch(), 'acme', 'plate', 'rk')).rejects.toThrow(
      /buffer is full/,
    );
  });

  it('throws when the broker nacks the publish', async () => {
    mockPublish.mockImplementationOnce((...args: PublishArgs) => {
      args[4]?.(new Error('channel closed'));
      return true;
    });
    const configService = { output: { queue: { brokerUrl: 'amqp://localhost' } } } as never;
    const driver = new RabbitmqQueueDriver(configService);

    await expect(driver.publish(buildBatch(), 'acme', 'plate', 'rk')).rejects.toThrow(/nacked/);
  });

  it('treats a returned (unroutable) message as a delivery failure, not a success', async () => {
    mockPublish.mockImplementationOnce((...args: PublishArgs) => {
      // RabbitMQ sends the 'return' frame before the ack for the same message.
      channelListeners.return({
        properties: { messageId: 'batch-1' },
        fields: { routingKey: args[1] },
      } as never);
      args[4]?.(null);
      return true;
    });
    const configService = { output: { queue: { brokerUrl: 'amqp://localhost' } } } as never;
    const driver = new RabbitmqQueueDriver(configService);

    await expect(driver.publish(buildBatch(), 'acme', 'plate', 'rk')).rejects.toThrow(/unroutable/);
  });

  it('reconnects on the next publish after the connection closes', async () => {
    const configService = { output: { queue: { brokerUrl: 'amqp://localhost' } } } as never;
    const driver = new RabbitmqQueueDriver(configService);

    await driver.publish(buildBatch(), 'acme', 'plate', 'rk');
    connectionListeners.close();
    await driver.publish(buildBatch(), 'acme', 'plate', 'rk');

    expect(mockConnect).toHaveBeenCalledTimes(2);
  });

  it('reconnects on the next publish after the channel closes', async () => {
    const configService = { output: { queue: { brokerUrl: 'amqp://localhost' } } } as never;
    const driver = new RabbitmqQueueDriver(configService);

    await driver.publish(buildBatch(), 'acme', 'plate', 'rk');
    channelListeners.close();
    await driver.publish(buildBatch(), 'acme', 'plate', 'rk');

    expect(mockConnect).toHaveBeenCalledTimes(2);
  });
});
