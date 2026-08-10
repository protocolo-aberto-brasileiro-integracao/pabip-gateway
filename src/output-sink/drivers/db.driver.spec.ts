const mockCreateMany = jest.fn().mockResolvedValue({ count: 1 });
const mockDisconnect = jest.fn().mockResolvedValue(undefined);

jest.mock('../../generated/output-sink-prisma/client', () => ({
  PrismaClient: jest.fn().mockImplementation(() => ({
    deliveredAnalyticsEvent: { createMany: mockCreateMany },
    $disconnect: mockDisconnect,
  })),
}));

jest.mock('@prisma/adapter-pg', () => ({
  PrismaPg: jest.fn().mockImplementation((connectionString: string) => ({ connectionString })),
}));

import { PrismaClient } from '../../generated/output-sink-prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { DbDriver } from './db.driver';
import type { DeliveryBatch } from '../output-sink.interface';

function buildBatch(): DeliveryBatch {
  return {
    batchId: 'batch-1',
    batchTime: '2026-05-08T14:00:00-03:00',
    batchCount: 1,
    batchType: 'plate',
    events: [
      {
        eventId: 'event-1',
        eventTime: '2026-05-08T14:00:00-03:00',
        sensorNodeId: 'node-1',
        partnerName: 'Acme',
        latitude: -22.9,
        longitude: -43.2,
        evidenceUrl: 'https://example.test/crop.jpg',
        data: { plate: 'ABC1D23', confidence: 0.97 },
      },
    ],
  };
}

describe('DbDriver', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('throws when output.db.connectionString is not configured', async () => {
    const driver = new DbDriver({ output: { db: { connectionString: undefined } } } as never);
    await expect(driver.deliver(buildBatch(), 'acme', 'plate')).rejects.toThrow(
      /output.db.connectionString is not configured/,
    );
  });

  it('creates one client connected via PrismaPg, and calls createMany with skipDuplicates', async () => {
    const configService = { output: { db: { connectionString: 'postgresql://dest/db' } } };
    const driver = new DbDriver(configService as never);

    await driver.deliver(buildBatch(), 'peer-1', 'plate');

    expect(PrismaPg).toHaveBeenCalledWith('postgresql://dest/db');
    expect(PrismaClient).toHaveBeenCalledTimes(1);
    expect(mockCreateMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          eventId: 'event-1',
          batchId: 'batch-1',
          batchType: 'plate',
          peerId: 'peer-1',
          data: { plate: 'ABC1D23', confidence: 0.97 },
        }),
      ],
      skipDuplicates: true,
    });
  });

  it('reuses the cached client across calls with the same connection string', async () => {
    const configService = { output: { db: { connectionString: 'postgresql://dest/db' } } };
    const driver = new DbDriver(configService as never);

    await driver.deliver(buildBatch(), 'peer-1', 'plate');
    await driver.deliver(buildBatch(), 'peer-1', 'plate');

    expect(PrismaClient).toHaveBeenCalledTimes(1);
    expect(mockCreateMany).toHaveBeenCalledTimes(2);
  });

  it('reconnects (and disconnects the old client) when the connection string changes', async () => {
    const configService = { output: { db: { connectionString: 'postgresql://dest/db' } } };
    const driver = new DbDriver(configService as never);

    await driver.deliver(buildBatch(), 'peer-1', 'plate');
    configService.output.db.connectionString = 'postgresql://dest2/db';
    await driver.deliver(buildBatch(), 'peer-1', 'plate');

    expect(PrismaClient).toHaveBeenCalledTimes(2);
    expect(mockDisconnect).toHaveBeenCalledTimes(1);
  });
});
