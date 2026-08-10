import { OperationLogService } from './operation-log.service';

function buildPrismaMock() {
  return {
    operationLog: { create: jest.fn().mockResolvedValue(undefined) },
    $queryRaw: jest.fn().mockResolvedValue([]),
  };
}

describe('OperationLogService', () => {
  describe('record', () => {
    it('writes a row with the given operation type, peer and metadata', async () => {
      const prisma = buildPrismaMock();
      const service = new OperationLogService(prisma as never);

      service.record('analytics_batch_received', 'peer-1', { batchId: 'b1' });
      await Promise.resolve();

      expect(prisma.operationLog.create).toHaveBeenCalledWith({
        data: {
          operationType: 'analytics_batch_received',
          peerId: 'peer-1',
          metadata: { batchId: 'b1' },
        },
      });
    });

    it('never throws when the write fails', async () => {
      const prisma = buildPrismaMock();
      prisma.operationLog.create.mockRejectedValue(new Error('db down'));
      const service = new OperationLogService(prisma as never);

      expect(() => service.record('analytics_batch_received', 'peer-1')).not.toThrow();
      await Promise.resolve();
    });
  });

  describe('summarize', () => {
    it('maps raw rows into date/operationType/count entries', async () => {
      const prisma = buildPrismaMock();
      prisma.$queryRaw.mockResolvedValue([
        {
          date: new Date('2026-08-06T00:00:00Z'),
          operationType: 'analytics_batch_received',
          count: BigInt(3),
        },
      ]);
      const service = new OperationLogService(prisma as never);

      const result = await service.summarize(new Date('2026-07-06'), new Date('2026-08-06'));

      expect(result).toEqual([
        { date: '2026-08-06', operationType: 'analytics_batch_received', count: 3 },
      ]);
    });
  });
});
