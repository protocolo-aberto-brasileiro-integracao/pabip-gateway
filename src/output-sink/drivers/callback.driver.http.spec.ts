import { HttpService } from '@nestjs/axios';
import nock from 'nock';
import { CallbackDriver } from './callback.driver';
import type { DeliveryBatch } from '../output-sink.interface';

describe('CallbackDriver (real HTTP via nock)', () => {
  const BASE_URL = 'https://legacy.example.test';

  function buildBatch(): DeliveryBatch {
    return {
      batchId: 'batch-1',
      batchTime: '2026-05-08T14:00:00-03:00',
      batchCount: 1,
      batchType: 'plate',
      events: [
        {
          eventId: 'event-1',
          eventTime: '2026-05-08T14:00:00-03:00',
          sensorNodeId: 'node-1',
          partnerName: 'Acme',
          latitude: -22.9,
          longitude: -43.2,
          evidenceUrl: 'https://example.test/crop.jpg',
          data: { plate: 'ABC1D23', confidence: 0.97 },
        },
      ],
    };
  }

  afterEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    nock.restore();
  });

  it('POSTs the whole batch as the body, with the configured and peer/batch-type headers', async () => {
    const scope = nock(BASE_URL)
      .post('/webhooks/pabip', (body: unknown) => {
        expect(body).toEqual(buildBatch());
        return true;
      })
      .matchHeader('authorization', 'Bearer legacy-token')
      .matchHeader('x-peer-id', 'peer-1')
      .matchHeader('x-batch-type', 'plate')
      .reply(200, { ok: true });

    process.env.TEST_CALLBACK_TOKEN = 'legacy-token';
    try {
      const driver = new CallbackDriver(new HttpService(), {
        output: {
          callback: {
            url: `${BASE_URL}/webhooks/pabip`,
            headers: { Authorization: 'Bearer ${TEST_CALLBACK_TOKEN}' },
          },
        },
      } as never);

      await driver.deliver(buildBatch(), 'peer-1', 'plate');
    } finally {
      delete process.env.TEST_CALLBACK_TOKEN;
    }

    expect(scope.isDone()).toBe(true);
  });

  it('propagates a real connection-refused failure to the caller', async () => {
    nock(BASE_URL).post('/webhooks/pabip').replyWithError('connect ECONNREFUSED');

    const driver = new CallbackDriver(new HttpService(), {
      output: { callback: { url: `${BASE_URL}/webhooks/pabip`, headers: {} } },
    } as never);

    await expect(driver.deliver(buildBatch(), 'peer-1', 'plate')).rejects.toThrow();
  });

  it('propagates a real 5xx response from the destination as a rejected promise', async () => {
    nock(BASE_URL).post('/webhooks/pabip').reply(503, { error: 'unavailable' });

    const driver = new CallbackDriver(new HttpService(), {
      output: { callback: { url: `${BASE_URL}/webhooks/pabip`, headers: {} } },
    } as never);

    await expect(driver.deliver(buildBatch(), 'peer-1', 'plate')).rejects.toThrow(
      /request failed with status code 503/i,
    );
  });
});
