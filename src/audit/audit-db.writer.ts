import { Injectable } from '@nestjs/common';
import type { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { AuditEvent } from './audit-event';

@Injectable()
export class AuditDbWriter {
  constructor(private readonly prisma: PrismaService) {}

  async write(event: AuditEvent): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        category: event.category,
        action: event.action,
        peerId: event.peerId,
        detail: event.detail,
        metadata: event.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
