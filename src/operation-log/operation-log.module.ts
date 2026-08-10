import { Global, Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { PrismaModule } from '../prisma/prisma.module';
import { OperationLogPartitionJob } from './operation-log-partition.job';
import { OperationLogService } from './operation-log.service';

@Global()
@Module({
  imports: [PrismaModule, ScheduleModule],
  providers: [OperationLogService, OperationLogPartitionJob],
  exports: [OperationLogService],
})
export class OperationLogModule {}
