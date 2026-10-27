import { Logger } from '@nestjs/common';
import { of, throwError } from 'rxjs';
import { CallbackDriver } from './callback.driver';
import type { DeliveryBatch } from '../output-sink.interface';

const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
        latitude: 0,
        longitude: 0,
        evidenceUrl: 'https://example.test/crop.jpg',
        data: { plate: 'ABC1D23', confidence: 0.97 },
      },
    ],
  };
}

describe('CallbackDriver', () => {
  afterEach(() => {
    delete process.env.TEST_LEGACY_TOKEN;
  });

  it('POSTs the whole batch to output.callback.url with resolved headers', async () => {
    process.env.TEST_LEGACY_TOKEN = 'super-secret-token';
    const post = jest.fn().mockReturnValue(of({ data: {} }));
    const http = { post } as never;
    const configService = {
      output: {
        callback: {
          url: 'https://legacy.example.test/webhooks/pabip',
          headers: { Authorization: 'Bearer ${TEST_LEGACY_TOKEN}', 'X-Static': 'value' },
        },
      },
    } as never;
    const driver = new CallbackDriver(http, configService);
    const batch = buildBatch();

    await driver.deliver(batch, 'peer-1', 'plate');

    expect(post).toHaveBeenCalledTimes(1);
    const [url, body, options] = post.mock.calls[0] as [
      string,
      unknown,
      { headers: Record<string, string> },
    ];
    expect(url).toBe('https://legacy.example.test/webhooks/pabip');
    expect(body).toEqual(batch);
    expect(options.headers).toMatchObject({
      Authorization: 'Bearer super-secret-token',
      'X-Static': 'value',
      'X-Peer-Id': 'peer-1',
      'X-Batch-Type': 'plate',
    });
  });

  it('sends a fresh UUID v7 X-Request-Id on each delivery attempt', async () => {
    const post = jest.fn().mockReturnValue(of({ status: 200, data: {}, headers: {} }));
    const driver = new CallbackDriver(
      { post } as never,
      {
        output: { callback: { url: 'https://legacy.example.test/webhooks/pabip', headers: {} } },
      } as never,
    );

    await driver.deliver(buildBatch(), 'peer-1', 'plate');
    await driver.deliver(buildBatch(), 'peer-1', 'plate');

    type PostArgs = [string, unknown, { headers: Record<string, string> }];
    const [, , firstOptions] = post.mock.calls[0] as PostArgs;
    const [, , secondOptions] = post.mock.calls[1] as PostArgs;
    const firstId = firstOptions.headers['X-Request-Id'];
    const secondId = secondOptions.headers['X-Request-Id'];
    expect(firstId).toMatch(UUID_V7_PATTERN);
    expect(secondId).toMatch(UUID_V7_PATTERN);
    expect(firstId).not.toBe(secondId);
  });

  it('logs the sent request id, the id echoed back by the receiver, and the response status', async () => {
    const log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
    const post = jest
      .fn()
      .mockReturnValue(of({ status: 202, data: {}, headers: { 'x-request-id': 'echoed-id' } }));
    const driver = new CallbackDriver(
      { post } as never,
      {
        output: { callback: { url: 'https://legacy.example.test/webhooks/pabip', headers: {} } },
      } as never,
    );

    await driver.deliver(buildBatch(), 'peer-1', 'plate');

    const [, , options] = post.mock.calls[0] as [
      string,
      unknown,
      { headers: Record<string, string> },
    ];
    const sentId = options.headers['X-Request-Id'];
    const [message] = log.mock.calls[0] as [string];
    expect(message).toContain('batchId=batch-1');
    expect(message).toContain(`requestId=${sentId}`);
    expect(message).toContain('echoedRequestId=echoed-id');
    expect(message).toContain('status=202');
    log.mockRestore();
  });

  it('throws when output.callback.url is not configured', async () => {
    const driver = new CallbackDriver(
      {} as never,
      {
        output: { callback: { url: undefined, headers: {} } },
      } as never,
    );

    await expect(driver.deliver(buildBatch(), 'peer-1', 'plate')).rejects.toThrow(
      /output.callback.url is not configured/,
    );
  });

  it('throws when a header references an unset environment variable', async () => {
    const driver = new CallbackDriver(
      {} as never,
      {
        output: {
          callback: {
            url: 'https://legacy.example.test',
            headers: { Authorization: 'Bearer ${DEFINITELY_NOT_SET_VAR}' },
          },
        },
      } as never,
    );

    await expect(driver.deliver(buildBatch(), 'peer-1', 'plate')).rejects.toThrow(
      /DEFINITELY_NOT_SET_VAR/,
    );
  });

  it('propagates the underlying HTTP error to the caller', async () => {
    const post = jest.fn().mockReturnValue(throwError(() => new Error('ECONNREFUSED')));
    const driver = new CallbackDriver(
      { post } as never,
      {
        output: { callback: { url: 'https://legacy.example.test', headers: {} } },
      } as never,
    );

    await expect(driver.deliver(buildBatch(), 'peer-1', 'plate')).rejects.toThrow('ECONNREFUSED');
  });
});
