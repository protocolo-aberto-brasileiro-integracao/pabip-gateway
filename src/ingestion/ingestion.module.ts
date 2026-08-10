import { Module } from '@nestjs/common';
import { OutputSinkModule } from '../output-sink/output-sink.module';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';
import { BatchScopeGuard } from './guards/batch-scope.guard';
import { IngestionController } from './ingestion.controller';
import { IngestionService } from './ingestion.service';

@Module({
  imports: [RateLimiterModule, OutputSinkModule],
  controllers: [IngestionController],
  providers: [IngestionService, BatchScopeGuard],
})
export class IngestionModule {}
