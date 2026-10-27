import { Injectable, Logger } from '@nestjs/common';
import type { AnalyticsBatchDto } from '@protocolo-aberto-brasileiro-integracao/pabip-sdk';
import { OperationLogService } from '../operation-log/operation-log.service';
import type { CachedPeer } from '../peers/peer-cache.service';
import { OutputSinkService } from '../output-sink/output-sink.service';
import type { IngestResponseDto } from './dto/ingest-response.dto';

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly outputSink: OutputSinkService,
    private readonly operationLog: OperationLogService,
  ) {}

  ingest(batch: AnalyticsBatchDto, peer: CachedPeer, requestId?: string): IngestResponseDto {
    this.operationLog.record(
      'analytics_batch_received',
      peer.id,
      {
        batchId: batch.batchId,
        batchType: batch.batchType,
      },
      { requestId },
    );

    void this.outputSink
      .deliver(batch, peer.id, batch.batchType, requestId)
      .catch((error: unknown) => {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.error(
          `output-sink.deliver() rejected unexpectedly for peer "${peer.name}" batch "${batch.batchId}": ${message}`,
          { peerId: peer.id, batchId: batch.batchId },
        );
      });

    return { batchId: batch.batchId, acceptedCount: batch.events.length };
  }
}
