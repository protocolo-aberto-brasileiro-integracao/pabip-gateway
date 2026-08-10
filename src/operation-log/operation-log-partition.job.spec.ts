import { OperationLogPartitionJob } from './operation-log-partition.job';

function buildPrismaMock() {
  return {
    $executeRawUnsafe: jest.fn().mockResolvedValue(undefined),
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
}

describe('OperationLogPartitionJob', () => {
  describe('ensurePartitionsExist', () => {
    it('creates today + lookahead partitions with the bounds embedded in the SQL', async () => {
      const prisma = buildPrismaMock();
      const job = new OperationLogPartitionJob(prisma as never);

      await job.ensurePartitionsExist(new Date('2026-08-06T12:00:00Z'));

      expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(3);
      expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
        1,
        'CREATE TABLE IF NOT EXISTS "operation_log_20260806" PARTITION OF "operation_log" ' +
          "FOR VALUES FROM ('2026-08-06T00:00:00.000Z') TO ('2026-08-07T00:00:00.000Z');",
      );
      expect(prisma.$executeRawUnsafe).toHaveBeenNthCalledWith(
        3,
        'CREATE TABLE IF NOT EXISTS "operation_log_20260808" PARTITION OF "operation_log" ' +
          "FOR VALUES FROM ('2026-08-08T00:00:00.000Z') TO ('2026-08-09T00:00:00.000Z');",
      );
    });

    it('never throws when a partition create fails', async () => {
      const prisma = buildPrismaMock();
      prisma.$executeRawUnsafe.mockRejectedValue(new Error('db down'));
      const job = new OperationLogPartitionJob(prisma as never);

      await expect(
        job.ensurePartitionsExist(new Date('2026-08-06T00:00:00Z')),
      ).resolves.toBeUndefined();
    });
  });

  describe('pruneExpiredPartitions', () => {
    it('drops only partitions past the retention window, skipping recent and invalid names', async () => {
      const prisma = buildPrismaMock();
      prisma.$queryRaw.mockResolvedValue([
        { tablename: 'operation_log_20260101' },
        { tablename: 'operation_log_20260805' },
        { tablename: 'operation_log_default' },
      ]);
      const job = new OperationLogPartitionJob(prisma as never);

      await job.pruneExpiredPartitions(new Date('2026-08-06T00:00:00Z'));

      expect(prisma.$executeRawUnsafe).toHaveBeenCalledTimes(1);
      expect(prisma.$executeRawUnsafe).toHaveBeenCalledWith(
        'DROP TABLE IF EXISTS "operation_log_20260101";',
      );
    });

    it('never throws when listing or dropping partitions fails', async () => {
      const prisma = buildPrismaMock();
      prisma.$queryRaw.mockRejectedValue(new Error('db down'));
      const job = new OperationLogPartitionJob(prisma as never);

      await expect(
        job.pruneExpiredPartitions(new Date('2026-08-06T00:00:00Z')),
      ).resolves.toBeUndefined();
    });
  });
});
