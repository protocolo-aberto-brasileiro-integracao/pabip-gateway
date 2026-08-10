import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient as GatewayPrismaClient } from '../../generated/prisma/client';
import { DbDriver } from './db.driver';
import type { DeliveryBatch } from '../output-sink.interface';

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://gateway:gateway@localhost:5432/gateway?schema=public';

function buildBatch(overrides: Partial<DeliveryBatch> = {}): DeliveryBatch {
  return {
    batchId: 'batch-integration-1',
    batchTime: '2026-05-08T14:00:00-03:00',
    batchCount: 1,
    batchType: 'plate',
    events: [
      {
        eventId: 'event-integration-1',
        eventTime: '2026-05-08T14:00:00-03:00',
        sensorNodeId: 'node-1',
        partnerName: 'Acme',
        latitude: -22.9,
        longitude: -43.2,
        evidenceUrl: 'https://example.test/crop.jpg',
        data: { plate: 'ABC1D23', confidence: 0.97 },
      },
    ],
    ...overrides,
  };
}

describe('DbDriver + Prisma integration (real Postgres)', () => {
  let setupClient: GatewayPrismaClient;

  beforeAll(async () => {
    setupClient = new GatewayPrismaClient({ adapter: new PrismaPg(TEST_DATABASE_URL) });
    await setupClient.$executeRawUnsafe(`DROP TABLE IF EXISTS "image_analytics_events"`);
    await setupClient.$executeRawUnsafe(`
      CREATE TABLE "image_analytics_events" (
        "eventId" TEXT NOT NULL,
        "eventTime" TIMESTAMP(3) NOT NULL,
        "sensorNodeId" TEXT NOT NULL,
        "partnerName" TEXT NOT NULL,
        "latitude" DOUBLE PRECISION NOT NULL,
        "longitude" DOUBLE PRECISION NOT NULL,
        "evidenceUrl" TEXT NOT NULL,
        "batchId" TEXT NOT NULL,
        "batchType" TEXT NOT NULL,
        "peerId" TEXT NOT NULL,
        "data" JSONB NOT NULL,
        "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

        CONSTRAINT "image_analytics_events_pkey" PRIMARY KEY ("eventId")
      )
    `);
  }, 20_000);

  afterAll(async () => {
    await setupClient.$executeRawUnsafe(`DROP TABLE IF EXISTS "image_analytics_events"`);
    await setupClient.$disconnect();
  });

  afterEach(async () => {
    await setupClient.$executeRawUnsafe(`DELETE FROM "image_analytics_events"`);
  });

  it('inserts every event of the batch, readable back with the original identifiers intact', async () => {
    const driver = new DbDriver({
      output: { db: { connectionString: TEST_DATABASE_URL } },
    } as never);

    try {
      await driver.deliver(buildBatch(), 'peer-1', 'plate');

      const rows = await setupClient.$queryRawUnsafe<
        Array<{ eventId: string; batchId: string; peerId: string; data: unknown }>
      >(`SELECT "eventId", "batchId", "peerId", "data" FROM "image_analytics_events"`);

      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        eventId: 'event-integration-1',
        batchId: 'batch-integration-1',
        peerId: 'peer-1',
        data: { plate: 'ABC1D23', confidence: 0.97 },
      });
    } finally {
      await driver.onModuleDestroy();
    }
  });

  it('redelivering the same eventId is a silent no-op, never a thrown unique-constraint error', async () => {
    const driver = new DbDriver({
      output: { db: { connectionString: TEST_DATABASE_URL } },
    } as never);

    try {
      await driver.deliver(buildBatch(), 'peer-1', 'plate');
      await expect(
        driver.deliver(buildBatch({ batchId: 'batch-integration-2' }), 'peer-1', 'plate'),
      ).resolves.toBeUndefined();

      const rows = await setupClient.$queryRawUnsafe<Array<{ batchId: string }>>(
        `SELECT "batchId" FROM "image_analytics_events" WHERE "eventId" = 'event-integration-1'`,
      );
      expect(rows).toHaveLength(1);
      expect(rows[0]?.batchId).toBe('batch-integration-1');
    } finally {
      await driver.onModuleDestroy();
    }
  });

  it('inserts every row of a multi-event batch in one createMany call, skipping only the duplicate', async () => {
    const driver = new DbDriver({
      output: { db: { connectionString: TEST_DATABASE_URL } },
    } as never);

    try {
      await driver.deliver(buildBatch(), 'peer-1', 'plate');

      const secondBatch = buildBatch({
        batchId: 'batch-integration-3',
        events: [
          buildBatch().events[0],
          {
            eventId: 'event-integration-2',
            eventTime: '2026-05-08T14:00:05-03:00',
            sensorNodeId: 'node-2',
            partnerName: 'Acme',
            latitude: -22.91,
            longitude: -43.21,
            evidenceUrl: 'https://example.test/crop-2.jpg',
            data: { confidence: 0.5 },
          },
        ],
      });
      await driver.deliver(secondBatch, 'peer-1', 'face');

      const rows = await setupClient.$queryRawUnsafe<Array<{ eventId: string }>>(
        `SELECT "eventId" FROM "image_analytics_events" ORDER BY "eventId"`,
      );
      expect(rows.map((row) => row.eventId)).toEqual([
        'event-integration-1',
        'event-integration-2',
      ]);
    } finally {
      await driver.onModuleDestroy();
    }
  });
});
