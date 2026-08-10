import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { ConfigModule } from '../config/config.module';
import { AUDIT_SINK_WRITER } from '../output-sink/audit-sink.tokens';
import { PEER_STORE_STATUS_LISTENER } from '../peers/peer-store-status.tokens';
import { PrismaModule } from '../prisma/prisma.module';
import { AuditDbWriter } from './audit-db.writer';
import { AuditRetentionJob } from './audit-retention.job';
import { AuditStdoutWriter } from './audit-stdout.writer';
import { AuditService } from './audit.service';

@Global()
@Module({
  imports: [ConfigModule, PrismaModule, ScheduleModule.forRoot()],
  providers: [
    AuditService,
    AuditStdoutWriter,
    AuditDbWriter,
    AuditRetentionJob,
    { provide: AUDIT_SINK_WRITER, useExisting: AuditService },
    { provide: PEER_STORE_STATUS_LISTENER, useExisting: AuditService },
  ],
  exports: [AuditService, AUDIT_SINK_WRITER, PEER_STORE_STATUS_LISTENER],
})
export class AuditModule {}
