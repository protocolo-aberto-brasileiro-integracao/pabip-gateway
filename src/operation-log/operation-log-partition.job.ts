import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import {
  MS_PER_DAY,
  OPERATION_LOG_PARTITION_LOOKAHEAD_DAYS,
  OPERATION_LOG_RETENTION_DAYS,
} from './operation-log.constants';
import {
  isValidPartitionName,
  partitionBoundsForDate,
  partitionDateFromName,
} from './operation-log-partition.util';

@Injectable()
export class OperationLogPartitionJob implements OnModuleInit {
  private readonly logger = new Logger(OperationLogPartitionJob.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.ensurePartitionsExist();
    await this.pruneExpiredPartitions();
  }

  @Cron(CronExpression.EVERY_DAY_AT_MIDNIGHT)
  async maintainPartitions(): Promise<void> {
    await this.ensurePartitionsExist();
    await this.pruneExpiredPartitions();
  }

  async ensurePartitionsExist(referenceDate: Date = new Date()): Promise<void> {
    for (let offset = 0; offset < OPERATION_LOG_PARTITION_LOOKAHEAD_DAYS; offset++) {
      const date = new Date(referenceDate.getTime() + offset * MS_PER_DAY);
      const { name, fromIso, toIso } = partitionBoundsForDate(date);
      if (!isValidPartitionName(name)) {
        this.logger.error(`Refusing to create partition with an unexpected name "${name}".`);
        continue;
      }

      try {
        await this.prisma.$executeRawUnsafe(
          `CREATE TABLE IF NOT EXISTS "${name}" PARTITION OF "operation_log" FOR VALUES FROM ('${fromIso}') TO ('${toIso}');`,
        );
      } catch (error) {
        this.logger.error(
          `Failed to ensure partition "${name}" exists.`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }

  async pruneExpiredPartitions(referenceDate: Date = new Date()): Promise<void> {
    const cutoff = new Date(referenceDate.getTime() - OPERATION_LOG_RETENTION_DAYS * MS_PER_DAY);

    let rows: { tablename: string }[];
    try {
      rows = await this.prisma.$queryRaw<{ tablename: string }[]>`
        SELECT tablename FROM pg_tables WHERE tablename LIKE 'operation_log_%'
      `;
    } catch (error) {
      this.logger.error(
        'Failed to list operation_log partitions for pruning.',
        error instanceof Error ? error.stack : String(error),
      );
      return;
    }

    for (const { tablename } of rows) {
      if (!isValidPartitionName(tablename)) {
        continue;
      }
      const partitionDate = partitionDateFromName(tablename);
      if (!partitionDate || partitionDate >= cutoff) {
        continue;
      }

      try {
        await this.prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS "${tablename}";`);
        this.logger.log(`Dropped expired partition "${tablename}".`);
      } catch (error) {
        this.logger.error(
          `Failed to drop expired partition "${tablename}".`,
          error instanceof Error ? error.stack : String(error),
        );
      }
    }
  }
}
