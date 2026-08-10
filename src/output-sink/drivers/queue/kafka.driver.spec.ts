const mockSend = jest.fn().mockResolvedValue(undefined);
const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockDisconnect = jest.fn().mockResolvedValue(undefined);
const mockProducer = jest.fn(() => ({
  connect: mockConnect,
  send: mockSend,
  disconnect: mockDisconnect,
}));

jest.mock('kafkajs', () => ({
  Kafka: jest.fn().mockImplementation(() => ({ producer: mockProducer })),
}));

import { Kafka } from 'kafkajs';
import { KafkaQueueDriver, parseKafkaBrokers } from './kafka.driver';
import type { DeliveryBatch } from '../../output-sink.interface';

function buildBatch(): DeliveryBatch {
  return { batchId: 'batch-1', batchTime: 't', batchCount: 0, batchType: 'plate', events: [] };
}

describe('parseKafkaBrokers', () => {
  it('strips the kafka:// prefix and splits the comma-separated list', () => {
    expect(parseKafkaBrokers('kafka://broker-1:9092,broker-2:9092')).toEqual([
      'broker-1:9092',
      'broker-2:9092',
    ]);
  });

  it('trims whitespace around each entry', () => {
    expect(parseKafkaBrokers('kafka://broker-1:9092, broker-2:9092')).toEqual([
      'broker-1:9092',
      'broker-2:9092',
    ]);
  });

  it('throws when there are no broker entries left after stripping the prefix', () => {
    expect(() => parseKafkaBrokers('kafka://')).toThrow(/no broker host:port entries/);
  });
});

describe('KafkaQueueDriver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('connects once and publishes with the routing key as the message key', async () => {
    const configService = { output: { queue: { brokerUrl: 'kafka://broker-1:9092' } } } as never;
    const driver = new KafkaQueueDriver(configService);

    await driver.publish(buildBatch(), 'acme', 'plate', 'pabip.events.acme.plate');

    expect(Kafka).toHaveBeenCalledWith(expect.objectContaining({ brokers: ['broker-1:9092'] }));
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        topic: 'pabip.events',
        messages: [
          expect.objectContaining({
            key: 'pabip.events.acme.plate',
            value: JSON.stringify(buildBatch()),
          }),
        ],
      }),
    );
  });

  it('reuses the cached producer across calls with the same brokerUrl', async () => {
    const configService = { output: { queue: { brokerUrl: 'kafka://broker-1:9092' } } } as never;
    const driver = new KafkaQueueDriver(configService);

    await driver.publish(buildBatch(), 'acme', 'plate', 'rk');
    await driver.publish(buildBatch(), 'acme', 'plate', 'rk');

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('reconnects when the brokerUrl changes', async () => {
    const configService = { output: { queue: { brokerUrl: 'kafka://broker-1:9092' } } };
    const driver = new KafkaQueueDriver(configService as never);

    await driver.publish(buildBatch(), 'acme', 'plate', 'rk');
    configService.output.queue.brokerUrl = 'kafka://broker-2:9092';
    await driver.publish(buildBatch(), 'acme', 'plate', 'rk');

    expect(mockConnect).toHaveBeenCalledTimes(2);
  });
});
