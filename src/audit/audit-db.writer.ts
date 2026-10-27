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
        requestId: 'requestId' in event ? event.requestId : undefined,
        actorId: 'actorId' in event ? event.actorId : undefined,
        caseRef: 'caseRef' in event ? event.caseRef : undefined,
        metadata: event.metadata as Prisma.InputJsonValue | undefined,
      },
    });
  }
}
