import type { Server } from 'node:http';
import type { INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';

describe('AppModule (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('responds to an unknown route with an RFC 7807 problem+json body', async () => {
    const response = await request(app.getHttpServer() as Server).get('/does-not-exist');

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
    expect(response.body).toMatchObject({
      type: 'https://protocolo-nacional.dev/problems/not-found',
      title: 'Not Found',
      status: 404,
      instance: '/does-not-exist',
    });
  });

  it('echoes an X-Request-Id header even on an error response', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/peers/some-peer/image-analytics/evt-1')
      .set('X-Request-Id', 'e2e.req-1');

    expect(response.headers['x-request-id']).toBe('e2e.req-1');
  });

  it('serves /healthz once the process is up, independent of any peer or database state', async () => {
    const response = await request(app.getHttpServer() as Server).get('/healthz');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
  });

  it('serves /readyz as ready once the initial peer snapshot has loaded at boot', async () => {
    const response = await request(app.getHttpServer() as Server).get('/readyz');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ready' });
  });

  it('serves /metrics in Prometheus text exposition format with the three design-named series', async () => {
    const response = await request(app.getHttpServer() as Server).get('/metrics');

    expect(response.status).toBe(200);
    expect(response.headers['content-type']).toContain('text/plain');
    expect(response.text).toContain('gateway_delivery_failed_total');
    expect(response.text).toContain('gateway_peer_store_unavailable');
    expect(response.text).toContain('gateway_circuit_breaker_state');
  });
});
