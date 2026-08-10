import { join } from 'node:path';
import { tmpdir } from 'node:os';
import type { Server } from 'node:http';
import { ValidationPipe, type INestApplication } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import nock from 'nock';
import request from 'supertest';
import { AppModule } from '../src/app.module';
import { ProblemDetailsFilter } from '../src/common/filters/problem-details.filter';
import { resetConfigFileCache } from '../src/config/config-file.loader';
import { PeerCacheService } from '../src/peers/peer-cache.service';
import { PrismaService } from '../src/prisma/prisma.service';

const TEST_DATABASE_URL =
  process.env.DATABASE_URL ?? 'postgresql://gateway:gateway@localhost:5432/gateway?schema=public';
const SEED_ADMIN_TOKEN = 'adm_e2e-test-token-do-not-use-in-prod';

const ORIGINAL_ENV = { ...process.env };

interface PeerListResponseBody {
  items: unknown[];
  page: number;
}

interface PeerResponseBody {
  id: string;
  name: string;
  issuedApiKey?: string;
}

interface IssuedAdminTokenResponseBody {
  id: string;
  token: string;
}

interface IssuedClientTokenResponseBody {
  id: string;
  token: string;
}

interface ConfigResponseBody {
  database: { url: string };
  logging: { level: string };
}

describe('admin-api (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let peerCache: PeerCacheService;

  beforeAll(async () => {
    process.env = { ...ORIGINAL_ENV };
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    process.env.GATEWAY_ENTE_PUBLICO_NAME = 'admin-api-e2e-test';
    process.env.GATEWAY_CONFIG_FILE = join(tmpdir(), 'does-not-exist-admin-api-e2e.yaml');
    process.env.GATEWAY_ADMIN_TOKENS = SEED_ADMIN_TOKEN;
    delete process.env.GATEWAY_DEV_MODE;
    resetConfigFileCache();

    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new ProblemDetailsFilter());
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = app.get(PrismaService);
    peerCache = app.get(PeerCacheService);
  }, 20_000);

  afterAll(async () => {
    await prisma.$executeRawUnsafe(
      `INSERT INTO "gateway_config" ("key", "value", "source", "seededAt", "updatedAt")
       VALUES ('logging.level', '"info"'::jsonb, 'default'::"config_source", now(), now())
       ON CONFLICT ("key") DO UPDATE SET
         "value" = EXCLUDED."value", "source" = EXCLUDED."source", "updatedAt" = now()`,
    );
    await app.close();
    process.env = { ...ORIGINAL_ENV };
    resetConfigFileCache();
  });

  afterEach(async () => {
    await prisma.peer.deleteMany({ where: { name: { startsWith: 'admin-api-e2e-' } } });
    nock.cleanAll();
  });

  it('rejects a request to the admin surface with no X-Admin-Token header', async () => {
    const response = await request(app.getHttpServer() as Server).get('/admin/peers');

    expect(response.status).toBe(401);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  it('rejects a request with an invalid X-Admin-Token', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/admin/peers')
      .set('X-Admin-Token', 'adm_not-a-real-token');

    expect(response.status).toBe(401);
  });

  it('serves /admin/peers flat, with no version prefix, once authenticated', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/admin/peers')
      .set('X-Admin-Token', SEED_ADMIN_TOKEN);

    const body = response.body as PeerListResponseBody;
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ page: 1 });
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('also serves the peer list at /peers, without the admin prefix — same PeersService.findAll(), duplicated for the bare passthrough surface', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/peers')
      .set('X-Admin-Token', SEED_ADMIN_TOKEN);

    const body = response.body as PeerListResponseBody;
    expect(response.status).toBe(200);
    expect(body).toMatchObject({ page: 1 });
    expect(Array.isArray(body.items)).toBe(true);
  });

  it('registers a peer through /admin/peers and reads it back through the same surface', async () => {
    const scope = nock('https://acme.example')
      .get('/sensor-nodes')
      .reply(200, { items: [{ capabilities: ['plate'] }] });

    const createResponse = await request(app.getHttpServer() as Server)
      .post('/admin/peers')
      .set('X-Admin-Token', SEED_ADMIN_TOKEN)
      .send({
        name: 'admin-api-e2e-acme',
        baseUrl: 'https://acme.example',
        theirApiKey: 'their-key-e2e',
        scopes: ['plate:write'],
      });

    expect(scope.isDone()).toBe(true);

    const createBody = createResponse.body as PeerResponseBody;
    expect(createResponse.status).toBe(201);
    expect(createBody).toMatchObject({ name: 'admin-api-e2e-acme' });
    expect(typeof createBody.issuedApiKey).toBe('string');

    const getResponse = await request(app.getHttpServer() as Server)
      .get(`/admin/peers/${createBody.id}`)
      .set('X-Admin-Token', SEED_ADMIN_TOKEN);

    const getBody = getResponse.body as PeerResponseBody;
    expect(getResponse.status).toBe(200);
    expect(getBody).toMatchObject({ name: 'admin-api-e2e-acme' });
    expect(getBody.issuedApiKey).toBeUndefined();
  });

  it('issues and revokes an admin token through /admin/tokens', async () => {
    const issueResponse = await request(app.getHttpServer() as Server)
      .post('/admin/tokens')
      .set('X-Admin-Token', SEED_ADMIN_TOKEN)
      .send({ label: 'admin-api-e2e-rotation' });

    const issueBody = issueResponse.body as IssuedAdminTokenResponseBody;
    expect(issueResponse.status).toBe(201);
    expect(typeof issueBody.token).toBe('string');

    const revokeResponse = await request(app.getHttpServer() as Server)
      .delete(`/admin/tokens/${issueBody.id}`)
      .set('X-Admin-Token', SEED_ADMIN_TOKEN);

    expect(revokeResponse.status).toBe(204);

    const afterRevoke = await request(app.getHttpServer() as Server)
      .get('/admin/peers')
      .set('X-Admin-Token', issueBody.token);
    expect(afterRevoke.status).toBe(401);

    const stillWorks = await request(app.getHttpServer() as Server)
      .get('/admin/peers')
      .set('X-Admin-Token', SEED_ADMIN_TOKEN);
    expect(stillWorks.status).toBe(200);
  });

  it('issues and revokes a client token through /admin/client-tokens — /admin/client-tokens itself stays admin-token-only', async () => {
    const rejectedWithoutAdmin = await request(app.getHttpServer() as Server).get(
      '/admin/client-tokens',
    );
    expect(rejectedWithoutAdmin.status).toBe(401);

    const issueResponse = await request(app.getHttpServer() as Server)
      .post('/admin/client-tokens')
      .set('X-Admin-Token', SEED_ADMIN_TOKEN)
      .send({ label: 'admin-api-e2e-client' });

    const issueBody = issueResponse.body as IssuedClientTokenResponseBody;
    expect(issueResponse.status).toBe(201);
    expect(issueBody.token.startsWith('clt_')).toBe(true);

    const revokeResponse = await request(app.getHttpServer() as Server)
      .delete(`/admin/client-tokens/${issueBody.id}`)
      .set('X-Admin-Token', SEED_ADMIN_TOKEN);
    expect(revokeResponse.status).toBe(204);
  });

  it('accepts a client token on /peers/* (PeersAccessGuard), but never on /admin/* — admin token remains a superset on /peers/*', async () => {
    const issueResponse = await request(app.getHttpServer() as Server)
      .post('/admin/client-tokens')
      .set('X-Admin-Token', SEED_ADMIN_TOKEN)
      .send({ label: 'admin-api-e2e-peers-access' });
    const clientToken = (issueResponse.body as IssuedClientTokenResponseBody).token;

    const viaClientToken = await request(app.getHttpServer() as Server)
      .get('/peers')
      .set('X-Client-Token', clientToken);
    expect(viaClientToken.status).toBe(200);

    const viaAdminToken = await request(app.getHttpServer() as Server)
      .get('/peers')
      .set('X-Admin-Token', SEED_ADMIN_TOKEN);
    expect(viaAdminToken.status).toBe(200);

    const clientTokenOnAdmin = await request(app.getHttpServer() as Server)
      .get('/admin/peers')
      .set('X-Client-Token', clientToken);
    expect(clientTokenOnAdmin.status).toBe(401);

    const neitherHeader = await request(app.getHttpServer() as Server).get('/peers');
    expect(neitherHeader.status).toBe(401);

    const invalidClientToken = await request(app.getHttpServer() as Server)
      .get('/peers')
      .set('X-Client-Token', 'clt_not-a-real-token');
    expect(invalidClientToken.status).toBe(401);
  });

  it("enforces a client token's own ip allowlist on /peers/* — 403, not 401, for a wrong IP; allowed once the loopback address is on it", async () => {
    const issueResponse = await request(app.getHttpServer() as Server)
      .post('/admin/client-tokens')
      .set('X-Admin-Token', SEED_ADMIN_TOKEN)
      .send({ label: 'admin-api-e2e-ip-allowlist', ipAllowlist: ['203.0.113.5'] });
    const restrictedToken = (issueResponse.body as IssuedClientTokenResponseBody).token;

    const rejected = await request(app.getHttpServer() as Server)
      .get('/peers')
      .set('X-Client-Token', restrictedToken);
    expect(rejected.status).toBe(403);

    const reissueResponse = await request(app.getHttpServer() as Server)
      .post('/admin/client-tokens')
      .set('X-Admin-Token', SEED_ADMIN_TOKEN)
      .send({ label: 'admin-api-e2e-ip-allowlist-ok', ipAllowlist: ['127.0.0.1'] });
    const allowedToken = (reissueResponse.body as IssuedClientTokenResponseBody).token;

    const allowed = await request(app.getHttpServer() as Server)
      .get('/peers')
      .set('X-Client-Token', allowedToken);
    expect(allowed.status).toBe(200);
  });

  it('rate-limits /peers/* per client token id, independent of other tokens', async () => {
    const issueResponse = await request(app.getHttpServer() as Server)
      .post('/admin/client-tokens')
      .set('X-Admin-Token', SEED_ADMIN_TOKEN)
      .send({ label: 'admin-api-e2e-rate-limit' });
    const clientToken = (issueResponse.body as IssuedClientTokenResponseBody).token;

    for (let i = 0; i < 60; i += 1) {
      const response = await request(app.getHttpServer() as Server)
        .get('/peers')
        .set('X-Client-Token', clientToken);
      expect(response.status).toBe(200);
    }

    const rejected = await request(app.getHttpServer() as Server)
      .get('/peers')
      .set('X-Client-Token', clientToken);
    expect(rejected.status).toBe(429);
    expect(rejected.headers['retry-after']).toBeDefined();

    const viaAdmin = await request(app.getHttpServer() as Server)
      .get('/peers')
      .set('X-Admin-Token', SEED_ADMIN_TOKEN);
    expect(viaAdmin.status).toBe(200);
  });

  it('reads and updates a non-boot-only field through /admin/config', async () => {
    const readResponse = await request(app.getHttpServer() as Server)
      .get('/admin/config')
      .set('X-Admin-Token', SEED_ADMIN_TOKEN);

    const readBody = readResponse.body as ConfigResponseBody;
    expect(readResponse.status).toBe(200);
    expect(readBody.database.url).toBe('[REDACTED]');

    const updateResponse = await request(app.getHttpServer() as Server)
      .patch('/admin/config')
      .set('X-Admin-Token', SEED_ADMIN_TOKEN)
      .send({ values: { 'logging.level': 'debug' } });

    const updateBody = updateResponse.body as ConfigResponseBody;
    expect(updateResponse.status).toBe(200);
    expect(updateBody.logging.level).toBe('debug');
  });

  it('rejects writing a boot-only field through /admin/config', async () => {
    const response = await request(app.getHttpServer() as Server)
      .patch('/admin/config')
      .set('X-Admin-Token', SEED_ADMIN_TOKEN)
      .send({ values: { 'database.url': 'postgresql://nope' } });

    expect(response.status).toBe(400);
  });

  it('serves /peers/{peerId}/sensor-nodes as a real outbound-client passthrough, cached on repeat', async () => {
    const baseUrl = 'https://passthrough.example';
    const onboardingScope = nock(baseUrl)
      .get('/sensor-nodes')
      .reply(200, { items: [{ capabilities: ['plate'] }] });

    const createResponse = await request(app.getHttpServer() as Server)
      .post('/admin/peers')
      .set('X-Admin-Token', SEED_ADMIN_TOKEN)
      .send({
        name: 'admin-api-e2e-passthrough',
        baseUrl,
        theirApiKey: 'their-key-passthrough',
        scopes: ['plate:write'],
      });
    expect(onboardingScope.isDone()).toBe(true);
    const peerId = (createResponse.body as PeerResponseBody).id;

    await waitFor(() => peerCache.getById(peerId) !== undefined, 5_000);

    const listingPayload = {
      items: [{ sensorNodeId: 'node-1', capabilities: ['plate'] }],
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
    };
    const passthroughScope = nock(baseUrl)
      .get('/sensor-nodes')
      .query(true)
      .matchHeader('x-api-key', 'their-key-passthrough')
      .reply(200, listingPayload);

    const firstResponse = await request(app.getHttpServer() as Server)
      .get(`/peers/${peerId}/sensor-nodes`)
      .set('X-Admin-Token', SEED_ADMIN_TOKEN);
    expect(firstResponse.status).toBe(200);
    expect(firstResponse.body).toEqual(listingPayload);
    expect(passthroughScope.isDone()).toBe(true);

    const secondResponse = await request(app.getHttpServer() as Server)
      .get(`/peers/${peerId}/sensor-nodes`)
      .set('X-Admin-Token', SEED_ADMIN_TOKEN);
    expect(secondResponse.status).toBe(200);
    expect(secondResponse.body).toEqual(listingPayload);
  });

  it('returns a 404 problem+json through the passthrough surface for an unregistered peer', async () => {
    const response = await request(app.getHttpServer() as Server)
      .get('/peers/does-not-exist/sensor-nodes')
      .set('X-Admin-Token', SEED_ADMIN_TOKEN);

    expect(response.status).toBe(404);
    expect(response.headers['content-type']).toContain('application/problem+json');
  });

  it('records an access audit_log row for a real image-analytics/{eventId} passthrough read', async () => {
    const switchToDb = await request(app.getHttpServer() as Server)
      .patch('/admin/config')
      .set('X-Admin-Token', SEED_ADMIN_TOKEN)
      .send({ values: { 'audit.sink': 'db' } });
    expect(switchToDb.status).toBe(200);

    try {
      const baseUrl = 'https://passthrough-audit.example';
      const onboardingScope = nock(baseUrl)
        .get('/sensor-nodes')
        .reply(200, { items: [{ capabilities: ['plate'] }] });

      const createResponse = await request(app.getHttpServer() as Server)
        .post('/admin/peers')
        .set('X-Admin-Token', SEED_ADMIN_TOKEN)
        .send({
          name: 'admin-api-e2e-audit',
          baseUrl,
          theirApiKey: 'their-key-audit',
          scopes: ['plate:write'],
        });
      expect(onboardingScope.isDone()).toBe(true);
      const peerId = (createResponse.body as PeerResponseBody).id;
      await waitFor(() => peerCache.getById(peerId) !== undefined, 5_000);

      const eventScope = nock(baseUrl)
        .get('/image-analytics/event-e2e-1')
        .reply(200, { eventId: 'event-e2e-1' });

      const response = await request(app.getHttpServer() as Server)
        .get(`/peers/${peerId}/image-analytics/event-e2e-1`)
        .set('X-Admin-Token', SEED_ADMIN_TOKEN);
      expect(response.status).toBe(200);
      expect(eventScope.isDone()).toBe(true);

      await waitFor(async () => {
        const rows = await prisma.auditLog.findMany({
          where: { category: 'access', action: 'image_analytics_read', peerId },
        });
        return rows.length === 1;
      }, 5_000);

      const [row] = await prisma.auditLog.findMany({
        where: { category: 'access', action: 'image_analytics_read', peerId },
      });
      expect(row?.detail).toBe('eventId=event-e2e-1');

      await prisma.auditLog.deleteMany({ where: { peerId } });
    } finally {
      await request(app.getHttpServer() as Server)
        .patch('/admin/config')
        .set('X-Admin-Token', SEED_ADMIN_TOKEN)
        .send({ values: { 'audit.sink': 'stdout' } });
    }
  });
});

async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeoutMs: number,
): Promise<void> {
  const start = Date.now();
  while (!(await condition())) {
    if (Date.now() - start > timeoutMs) {
      throw new Error(`waitFor: condition not met within ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
}
