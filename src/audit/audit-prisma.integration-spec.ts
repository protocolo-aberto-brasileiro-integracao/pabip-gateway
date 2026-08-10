import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PrismaService } from '../prisma/prisma.service';
import { resetConfigFileCache } from '../config/config-file.loader';
import { AuditDbWriter } from './audit-db.writer';
import { AuditRetentionJob } from './audit-retention.job';
import type { AuditEvent } from './audit-event';

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://gateway:gateway@localhost:5432/gateway?schema=public';

const ORIGINAL_ENV = { ...process.env };

describe('audit + Prisma integration (real Postgres)', () => {
  let prisma: PrismaService;

  beforeAll(async () => {
    process.env = { ...ORIGINAL_ENV };
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.GATEWAY_CONFIG_FILE = join(tmpdir(), 'does-not-exist-audit-integration.yaml');
    delete process.env.GATEWAY_DEV_MODE;
    resetConfigFileCache();

    prisma = new PrismaService();
    await prisma.onModuleInit();
  }, 20_000);

  afterAll(async () => {
    await prisma.onModuleDestroy();
    process.env = { ...ORIGINAL_ENV };
    resetConfigFileCache();
  });

  afterEach(async () => {
    await prisma.auditLog.deleteMany({ where: { peerId: { startsWith: 'integration-test-' } } });
  });

  describe('AuditDbWriter', () => {
    it('persists a delivery event with its metadata as a queryable jsonb column', async () => {
      const writer = new AuditDbWriter(prisma);
      const event: AuditEvent = {
        category: 'delivery',
        action: 'delivery_failed',
        peerId: 'integration-test-peer-1',
        detail: 'destination unreachable',
        metadata: {
          batchId: 'batch-1',
          batchType: 'plate',
          eventIds: ['event-1', 'event-2'],
          attempts: 3,
        },
      };

      await writer.write(event);

      const [row] = await prisma.auditLog.findMany({
        where: { peerId: 'integration-test-peer-1' },
      });
      expect(row).toMatchObject({
        category: 'delivery',
        action: 'delivery_failed',
        peerId: 'integration-test-peer-1',
        detail: 'destination unreachable',
        metadata: {
          batchId: 'batch-1',
          batchType: 'plate',
          eventIds: ['event-1', 'event-2'],
          attempts: 3,
        },
      });
      expect(row?.createdAt).toBeInstanceOf(Date);
    });

    it('persists a peer_store event with a null peerId/metadata rather than failing the insert', async () => {
      const writer = new AuditDbWriter(prisma);
      const event: AuditEvent = {
        category: 'peer_store',
        action: 'peer_store_unavailable',
        detail: 'Peer registry database unreachable; serving cached peers only.',
      };

      await writer.write(event);

      const [row] = await prisma.auditLog.findMany({
        where: { category: 'peer_store', action: 'peer_store_unavailable' },
        orderBy: { createdAt: 'desc' },
      });
      expect(row?.peerId).toBeNull();
      expect(row?.metadata).toBeNull();

      if (row) {
        await prisma.auditLog.delete({ where: { id: row.id } });
      }
    });
  });

  describe('AuditRetentionJob', () => {
    it('purges only rows older than audit.retentionDays, real DELETE against real rows', async () => {
      const oldRow = await prisma.auditLog.create({
        data: {
          category: 'access',
          action: 'image_analytics_read',
          peerId: 'integration-test-peer-2',
          detail: 'eventId=old',
        },
      });
      await prisma.auditLog.update({
        where: { id: oldRow.id },
        data: { createdAt: new Date(Date.now() - 200 * 24 * 60 * 60 * 1000) },
      });

      const recentRow = await prisma.auditLog.create({
        data: {
          category: 'access',
          action: 'image_analytics_read',
          peerId: 'integration-test-peer-2',
          detail: 'eventId=recent',
        },
      });

      const configService = { audit: { sink: 'db' as const, retentionDays: 180 } };
      const job = new AuditRetentionJob(configService as never, prisma);
      await job.purgeExpired();

      const remaining = await prisma.auditLog.findMany({
        where: { peerId: 'integration-test-peer-2' },
      });
      expect(remaining.map((row) => row.id)).toEqual([recentRow.id]);
    });

    it('does nothing when audit.sink is stdout, leaving every row untouched', async () => {
      const row = await prisma.auditLog.create({
        data: {
          category: 'access',
          action: 'image_analytics_read',
          peerId: 'integration-test-peer-3',
          detail: 'eventId=untouched',
        },
      });
      await prisma.auditLog.update({
        where: { id: row.id },
        data: { createdAt: new Date(Date.now() - 400 * 24 * 60 * 60 * 1000) },
      });

      const configService = { audit: { sink: 'stdout' as const, retentionDays: 180 } };
      const job = new AuditRetentionJob(configService as never, prisma);
      await job.purgeExpired();

      const remaining = await prisma.auditLog.findMany({
        where: { peerId: 'integration-test-peer-3' },
      });
      expect(remaining).toHaveLength(1);
    });
  });
});
