import { Injectable, Logger } from '@nestjs/common';
import type { OperationType, Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';

export interface OperationLogSummaryEntry {
  date: string;
  operationType: string;
  count: number;
}

@Injectable()
export class OperationLogService {
  private readonly logger = new Logger(OperationLogService.name);

  constructor(private readonly prisma: PrismaService) {}

  record(
    operationType: OperationType,
    peerId: string | undefined,
    metadata?: Record<string, unknown>,
    trace?: { requestId?: string; actorId?: string; caseRef?: string },
  ): void {
    this.prisma.operationLog
      .create({
        data: {
          operationType,
          peerId,
          metadata: metadata as Prisma.InputJsonValue | undefined,
          requestId: trace?.requestId,
          actorId: trace?.actorId,
          caseRef: trace?.caseRef,
        },
      })
      .catch((error: unknown) => {
        this.logger.error(
          `Failed to write operation_log row (operationType=${operationType}).`,
          error instanceof Error ? error.stack : String(error),
        );
      });
  }

  async summarize(from: Date, to: Date): Promise<OperationLogSummaryEntry[]> {
    const rows = await this.prisma.$queryRaw<
      { date: Date; operationType: string; count: bigint }[]
    >`
      SELECT date_trunc('day', "createdAt") AS date, "operationType"::text AS "operationType", COUNT(*) AS count
      FROM "operation_log"
      WHERE "createdAt" >= ${from} AND "createdAt" < ${to}
      GROUP BY date, "operationType"
      ORDER BY date ASC, "operationType" ASC
    `;

    return rows.map((row) => ({
      date: row.date.toISOString().slice(0, 10),
      operationType: row.operationType,
      count: Number(row.count),
    }));
  }
}
