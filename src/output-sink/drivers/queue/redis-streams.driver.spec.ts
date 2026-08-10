const mockXadd = jest.fn().mockResolvedValue('0-1');
const mockOn = jest.fn();
const mockDisconnect = jest.fn();

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    xadd: mockXadd,
    on: mockOn,
    disconnect: mockDisconnect,
  }));
});

import Redis from 'ioredis';
import { RedisStreamsQueueDriver } from './redis-streams.driver';
import type { DeliveryBatch } from '../../output-sink.interface';

function buildBatch(): DeliveryBatch {
  return { batchId: 'batch-1', batchTime: 't', batchCount: 0, batchType: 'plate', events: [] };
}

describe('RedisStreamsQueueDriver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('publishes to the stream named after the routing key', async () => {
    const configService = { output: { queue: { brokerUrl: 'redis://localhost:6379' } } } as never;
    const driver = new RedisStreamsQueueDriver(configService);

    await driver.publish(buildBatch(), 'acme', 'plate', 'pabip.events.acme.plate');

    expect(Redis).toHaveBeenCalledWith('redis://localhost:6379', expect.any(Object));
    expect(mockXadd).toHaveBeenCalledWith(
      'pabip.events.acme.plate',
      '*',
      'peerId',
      'acme',
      'batchType',
      'plate',
      'batchId',
      'batch-1',
      'payload',
      JSON.stringify(buildBatch()),
    );
  });

  it('reuses the cached client across calls with the same brokerUrl', async () => {
    const configService = { output: { queue: { brokerUrl: 'redis://localhost:6379' } } } as never;
    const driver = new RedisStreamsQueueDriver(configService);

    await driver.publish(buildBatch(), 'acme', 'plate', 'rk-1');
    await driver.publish(buildBatch(), 'acme', 'plate', 'rk-2');

    expect(Redis).toHaveBeenCalledTimes(1);
    expect(mockXadd).toHaveBeenCalledTimes(2);
  });

  it('reconnects when the brokerUrl changes', async () => {
    const configService = { output: { queue: { brokerUrl: 'redis://localhost:6379' } } };
    const driver = new RedisStreamsQueueDriver(configService as never);

    await driver.publish(buildBatch(), 'acme', 'plate', 'rk');
    configService.output.queue.brokerUrl = 'redis://localhost:6380';
    await driver.publish(buildBatch(), 'acme', 'plate', 'rk');

    expect(Redis).toHaveBeenCalledTimes(2);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
