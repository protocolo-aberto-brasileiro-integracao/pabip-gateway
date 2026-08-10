import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { ConfigService } from '../config/config.service';
import { PrismaService } from '../prisma/prisma.service';

const MS_PER_DAY = 24 * 60 * 60 * 1000;

@Injectable()
export class AuditRetentionJob {
  private readonly logger = new Logger(AuditRetentionJob.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly prisma: PrismaService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async purgeExpired(): Promise<void> {
    if (this.configService.audit.sink !== 'db') {
      return;
    }

    const { retentionDays } = this.configService.audit;
    const cutoff = new Date(Date.now() - retentionDays * MS_PER_DAY);

    try {
      const { count } = await this.prisma.auditLog.deleteMany({
        where: { createdAt: { lt: cutoff } },
      });
      if (count > 0) {
        this.logger.log(`Purged ${count} audit_log row(s) older than ${retentionDays}d.`);
      }
    } catch (error) {
      this.logger.error(
        'Failed to purge expired audit_log rows.',
        error instanceof Error ? error.stack : String(error),
      );
    }
  }
}
