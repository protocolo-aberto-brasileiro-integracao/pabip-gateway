import * as http from 'node:http';
import type { Server } from 'node:http';
import { Test, type TestingModule } from '@nestjs/testing';
import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { createPathGate } from '../src/common/http-listener.util';
import { ShutdownService } from '../src/common/shutdown.service';

describe('dual listener wiring (e2e)', () => {
  let app: NestExpressApplication;
  let publicServer: Server;
  let adminServer: Server;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestExpressApplication>();
    app.useGlobalFilters(new ProblemDetailsFilter());
    await app.init();

    const sharedHandler = app.getHttpAdapter().getInstance();
    publicServer = http.createServer(createPathGate(sharedHandler, ['/image-analytics', '/peers']));
    adminServer = http.createServer(
      createPathGate(sharedHandler, ['/admin', '/healthz', '/readyz', '/metrics']),
    );
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => publicServer.close(() => resolve()));
    await new Promise<void>((resolve) => adminServer.close(() => resolve()));
    await app.close();
  });

  it('serves /healthz on the admin listener', async () => {
    const response = await request(adminServer).get('/healthz');
    expect(response.status).toBe(200);
  });

  it('never exposes /healthz on the public listener', async () => {
    const response = await request(publicServer).get('/healthz');
    expect(response.status).toBe(404);
  });

  it('serves /metrics on the admin listener', async () => {
    const response = await request(adminServer).get('/metrics');
    expect(response.status).toBe(200);
  });

  it('never exposes /admin/* on the public listener, not even to reach the real AdminTokenGuard', async () => {
    const response = await request(publicServer).get('/admin/peers');
    expect(response.status).toBe(404);
  });

  it('reaches the real AdminTokenGuard for /admin/* on the admin listener (401, not 404)', async () => {
    const response = await request(adminServer).get('/admin/peers');
    expect(response.status).toBe(401);
  });

  it('never exposes /peers on the admin listener, not even to reach the real PeersAccessGuard', async () => {
    const response = await request(adminServer).get('/peers');
    expect(response.status).toBe(404);
  });

  it('reaches the real PeersAccessGuard for /peers on the public listener (401, not 404)', async () => {
    const response = await request(publicServer).get('/peers');
    expect(response.status).toBe(401);
  });

  it('reaches the real PeersAccessGuard via X-Client-Token too, still gated the same way (401 with an invalid one, not 404)', async () => {
    const response = await request(publicServer)
      .get('/peers')
      .set('X-Client-Token', 'clt_not-a-real-token');
    expect(response.status).toBe(401);
  });

  it('never exposes /image-analytics/* on the admin listener', async () => {
    const response = await request(adminServer).post('/image-analytics/events').send({});
    expect(response.status).toBe(404);
  });

  it('reaches the real ApiKeyGuard for /image-analytics/* on the public listener (401, not 404)', async () => {
    const response = await request(publicServer).post('/image-analytics/events').send({});
    expect(response.status).toBe(401);
  });

  it('flips /readyz to 503 the instant ShutdownService.beginDraining() runs, without affecting /healthz', async () => {
    const readyBefore = await request(adminServer).get('/readyz');
    expect(readyBefore.status).toBe(200);

    app.get(ShutdownService).beginDraining();

    const readyAfter = await request(adminServer).get('/readyz');
    expect(readyAfter.status).toBe(503);

    const liveness = await request(adminServer).get('/healthz');
    expect(liveness.status).toBe(200);
  });
});
