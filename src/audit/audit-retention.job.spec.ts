import { Logger } from '@nestjs/common';
import { AuditRetentionJob } from './audit-retention.job';

type DeleteManyArgs = { where: { createdAt: { lt: Date } } };

function buildJob(sink: 'stdout' | 'db', retentionDays = 180) {
  const configService = { audit: { sink, retentionDays } };
  const deleteMany = jest.fn<Promise<{ count: number }>, [DeleteManyArgs]>().mockResolvedValue({
    count: 0,
  });
  const prisma = { auditLog: { deleteMany } };
  const job = new AuditRetentionJob(configService as never, prisma as never);
  return { job, deleteMany };
}

describe('AuditRetentionJob', () => {
  it('does nothing when audit.sink is stdout', async () => {
    const { job, deleteMany } = buildJob('stdout');

    await job.purgeExpired();

    expect(deleteMany).not.toHaveBeenCalled();
  });

  it('deletes rows older than audit.retentionDays when audit.sink is db', async () => {
    const { job, deleteMany } = buildJob('db', 30);
    const before = Date.now();

    await job.purgeExpired();

    expect(deleteMany).toHaveBeenCalledTimes(1);
    const cutoff = deleteMany.mock.calls[0][0].where.createdAt.lt;
    const expectedCutoff = before - 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(cutoff.getTime() - expectedCutoff)).toBeLessThan(5000);
  });

  it('logs the purged row count when at least one row is deleted', async () => {
    const { job, deleteMany } = buildJob('db');
    deleteMany.mockResolvedValue({ count: 3 });
    const logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);

    await job.purgeExpired();

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('Purged 3 audit_log row(s)'));
    logSpy.mockRestore();
  });

  it('logs, but never throws, when the delete itself fails', async () => {
    const { job, deleteMany } = buildJob('db');
    deleteMany.mockRejectedValue(new Error('connection lost'));

    await expect(job.purgeExpired()).resolves.toBeUndefined();
  });
});
