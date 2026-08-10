import { Module } from '@nestjs/common';
import { OutputSinkModule } from '../output-sink/output-sink.module';
import { ShutdownService } from './shutdown.service';

@Module({
  imports: [OutputSinkModule],
  providers: [ShutdownService],
  exports: [ShutdownService],
})
export class ShutdownModule {}
