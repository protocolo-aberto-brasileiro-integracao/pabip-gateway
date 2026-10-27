import { Logger } from '@nestjs/common';
import { IngestionService } from './ingestion.service';
import type { AnalyticsBatchDto } from '@protocolo-aberto-brasileiro-integracao/pabip-sdk';

function buildBatch(): AnalyticsBatchDto {
  return {
    batchId: 'batch-1',
    batchTime: '2026-05-08T14:00:00-03:00',
    batchCount: 2,
    batchType: 'plate',
    events: [{ eventId: 'a' }, { eventId: 'b' }] as never,
  };
}

function buildOperationLog() {
  return { record: jest.fn() };
}

describe('IngestionService', () => {
  it('returns a 202 body reflecting the full batch synchronously, without waiting on delivery', () => {
    let resolveDelivery!: () => void;
    const outputSink = {
      deliver: jest.fn(
        () =>
          new Promise<void>((resolve) => {
            resolveDelivery = resolve;
          }),
      ),
    };
    const service = new IngestionService(outputSink as never, buildOperationLog() as never);
    const peer = { id: 'peer-1', name: 'acme' } as never;

    const response = service.ingest(buildBatch(), peer, 'req-1');

    expect(response).toEqual({ batchId: 'batch-1', acceptedCount: 2 });
    expect(outputSink.deliver).toHaveBeenCalledWith(buildBatch(), 'peer-1', 'plate', 'req-1');

    resolveDelivery();
  });

  it('acceptedCount always reflects events.length, even if it differs from batchCount', () => {
    const outputSink = { deliver: jest.fn().mockResolvedValue(undefined) };
    const service = new IngestionService(outputSink as never, buildOperationLog() as never);
    const peer = { id: 'peer-1', name: 'acme' } as never;
    const batch = { ...buildBatch(), batchCount: 99 };

    const response = service.ingest(batch, peer);

    expect(response.acceptedCount).toBe(2);
  });

  it('records an analytics_batch_received operation with the batch id and type', () => {
    const outputSink = { deliver: jest.fn().mockResolvedValue(undefined) };
    const operationLog = buildOperationLog();
    const service = new IngestionService(outputSink as never, operationLog as never);
    const peer = { id: 'peer-1', name: 'acme' } as never;

    service.ingest(buildBatch(), peer, 'req-1');

    expect(operationLog.record).toHaveBeenCalledWith(
      'analytics_batch_received',
      'peer-1',
      {
        batchId: 'batch-1',
        batchType: 'plate',
      },
      { requestId: 'req-1' },
    );
  });

  it('never lets a rejected delivery promise escape as an unhandled rejection', async () => {
    const loggerError = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const outputSink = { deliver: jest.fn().mockRejectedValue(new Error('unexpected')) };
    const service = new IngestionService(outputSink as never, buildOperationLog() as never);
    const peer = { id: 'peer-1', name: 'acme' } as never;

    expect(() => service.ingest(buildBatch(), peer)).not.toThrow();
    await new Promise((resolve) => setImmediate(resolve));

    expect(loggerError).toHaveBeenCalledWith(expect.stringContaining('unexpected'), {
      peerId: 'peer-1',
      batchId: 'batch-1',
    });
    loggerError.mockRestore();
  });
});
