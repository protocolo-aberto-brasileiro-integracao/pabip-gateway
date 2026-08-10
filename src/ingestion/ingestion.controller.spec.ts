import { IngestionController } from './ingestion.controller';
import type { AnalyticsBatchDto } from '@protocolo-aberto-brasileiro-integracao/pabip-sdk';
import type { IngestResponseDto } from './dto/ingest-response.dto';

describe('IngestionController', () => {
  it('delegates to IngestionService.ingest with the parsed batch and resolved peer, returning its result', () => {
    const expectedResponse: IngestResponseDto = { batchId: 'batch-1', acceptedCount: 1 };
    const ingestionService = { ingest: jest.fn().mockReturnValue(expectedResponse) };
    const controller = new IngestionController(ingestionService as never);
    const batch = { batchId: 'batch-1' } as AnalyticsBatchDto;
    const peer = { id: 'peer-1', name: 'acme' } as never;

    const response = controller.ingest(batch, peer);

    expect(ingestionService.ingest).toHaveBeenCalledWith(batch, peer);
    expect(response).toBe(expectedResponse);
  });
});
