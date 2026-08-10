import { HttpService } from '@nestjs/axios';
import nock from 'nock';
import { KeyIssuanceService } from '../auth/key-issuance.service';
import { OnboardingService } from './onboarding.service';
import { PeerUnreachableError } from './peer-onboarding.error';

describe('OnboardingService', () => {
  const BASE_URL = 'https://partner.example';
  let service: OnboardingService;

  beforeEach(() => {
    service = new OnboardingService(new HttpService(), new KeyIssuanceService());
  });

  afterEach(() => {
    nock.cleanAll();
  });

  afterAll(() => {
    nock.restore();
  });

  it('returns detected capabilities and an issued key on a 200 manifest response', async () => {
    nock(BASE_URL)
      .get('/sensor-nodes')
      .matchHeader('x-api-key', 'their-key')
      .reply(200, {
        items: [
          { id: 'node-1', capabilities: ['plate'] },
          { id: 'node-2', capabilities: ['face', 'plate'] },
        ],
      });

    const result = await service.onboard({
      baseUrl: BASE_URL,
      theirApiKey: 'their-key',
      timeoutMs: 2_000,
    });

    expect(result.capabilities.sort()).toEqual(['face', 'plate']);
    expect(result.issuedApiKey.startsWith('ak_live_')).toBe(true);
    expect(result.apiKeyHash).toHaveLength(64);
  });

  it('throws PeerUnreachableError when the peer never responds within the timeout', async () => {
    nock(BASE_URL).get('/sensor-nodes').delay(200).reply(200, { items: [] });

    await expect(
      service.onboard({ baseUrl: BASE_URL, theirApiKey: 'their-key', timeoutMs: 50 }),
    ).rejects.toThrow(PeerUnreachableError);
  }, 10_000);

  it('throws PeerUnreachableError on an explicit 422 from the peer', async () => {
    nock(BASE_URL).get('/sensor-nodes').reply(422, { error: 'unsupported manifest' });

    await expect(
      service.onboard({ baseUrl: BASE_URL, theirApiKey: 'their-key', timeoutMs: 2_000 }),
    ).rejects.toThrow(PeerUnreachableError);
  });

  it('throws PeerUnreachableError with the underlying message on a connection-level failure', async () => {
    nock(BASE_URL).get('/sensor-nodes').replyWithError('connection reset by peer');

    await expect(
      service.onboard({ baseUrl: BASE_URL, theirApiKey: 'their-key', timeoutMs: 2_000 }),
    ).rejects.toThrow(/connection reset by peer/);
  });

  it('treats a manifest with no items as zero capabilities, not a failure', async () => {
    nock(BASE_URL).get('/sensor-nodes').reply(200, { items: [] });

    const result = await service.onboard({
      baseUrl: BASE_URL,
      theirApiKey: 'their-key',
      timeoutMs: 2_000,
    });

    expect(result.capabilities).toEqual([]);
  });
});
