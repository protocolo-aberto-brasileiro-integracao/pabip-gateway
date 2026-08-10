import { Injectable } from '@nestjs/common';
import pino, { type Logger as Pino } from 'pino';
import type { AuditEvent } from './audit-event';

@Injectable()
export class AuditStdoutWriter {
  private readonly pino: Pino = pino({
    level: 'info',
    base: undefined,
    timestamp: pino.stdTimeFunctions.isoTime,
  });

  write(event: AuditEvent): Promise<void> {
    this.pino.info(event);
    return Promise.resolve();
  }
}
