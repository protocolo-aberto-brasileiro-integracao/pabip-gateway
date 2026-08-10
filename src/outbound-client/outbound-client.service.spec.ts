import { HttpException, HttpStatus, NotFoundException } from '@nestjs/common';
import { CircuitBreakerRegistry } from '../circuit-breaker/circuit-breaker.registry';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import type { ConfigService } from '../config/config.service';
import type { CachedPeer } from '../peers/peer-cache.service';
import type { PeersService } from '../peers/peers.service';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';
import { ListingCacheService } from './listing-cache.service';
import { OutboundClientService } from './outbound-client.service';

function buildPeer(overrides: Partial<CachedPeer> = {}): CachedPeer {
  return {
    id: 'peer-1',
    name: 'Acme',
    baseUrl: 'https://acme.example.test',
    theirApiKey: 'their-secret-key',
    apiKeyHash: 'hash',
    scopes: ['plate:write'],
    ipAllowlist: [],
    capabilities: ['plate'],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function buildPeersService(peer: CachedPeer | undefined): PeersService {
  return {
    resolve: (peerId: string) => (peer && peer.id === peerId ? peer : undefined),
  } as unknown as PeersService;
}

function buildCircuitBreaker(): CircuitBreakerService {
  const configService = {
    circuitBreaker: { errorThreshold: 0.5, windowSeconds: 30 },
  } as unknown as ConfigService;
  return new CircuitBreakerService(new CircuitBreakerRegistry(configService));
}

function buildService(options: {
  peer?: CachedPeer;
  sensorNodesClient?: { listSensorNodes: jest.Mock; getSensorNode: jest.Mock };
  videoClient?: { createSession: jest.Mock; getRecordings: jest.Mock };
  imageAnalyticsClient?: { getEvent: jest.Mock };
  rateLimiter?: RateLimiterService;
  circuitBreaker?: CircuitBreakerService;
}): OutboundClientService {
  const peer = options.peer ?? buildPeer();
  return new OutboundClientService(
    buildPeersService(peer),
    options.rateLimiter ?? new RateLimiterService(),
    options.circuitBreaker ?? buildCircuitBreaker(),
    (options.sensorNodesClient ?? {
      listSensorNodes: jest.fn(),
      getSensorNode: jest.fn(),
    }) as never,
    (options.videoClient ?? { createSession: jest.fn(), getRecordings: jest.fn() }) as never,
    (options.imageAnalyticsClient ?? { getEvent: jest.fn() }) as never,
    new ListingCacheService(),
  );
}

describe('OutboundClientService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  describe('peer resolution', () => {
    it('rejects with NotFoundException when the peer is not registered', async () => {
      const service = buildService({ peer: undefined });

      await expect(service.getSensorNode('unknown-peer', 'node-1')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('listSensorNodes', () => {
    it('delegates to SensorNodesClient and caches the result for the same (peerId, page, pageSize)', async () => {
      const listing = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };
      const sensorNodesClient = {
        listSensorNodes: jest.fn().mockResolvedValue(listing),
        getSensorNode: jest.fn(),
      };
      const service = buildService({ sensorNodesClient });

      const first = await service.listSensorNodes('peer-1', 1, 20);
      const second = await service.listSensorNodes('peer-1', 1, 20);

      expect(first).toEqual(listing);
      expect(second).toEqual(listing);
      expect(sensorNodesClient.listSensorNodes).toHaveBeenCalledTimes(1);
    });

    it('applies default page/pageSize when neither is supplied', async () => {
      const listing = { items: [], page: 1, pageSize: 20, total: 0, totalPages: 0 };
      const sensorNodesClient = {
        listSensorNodes: jest.fn().mockResolvedValue(listing),
        getSensorNode: jest.fn(),
      };
      const service = buildService({ sensorNodesClient });

      await service.listSensorNodes('peer-1');

      expect(sensorNodesClient.listSensorNodes).toHaveBeenCalledWith(
        { baseUrl: 'https://acme.example.test', apiKey: 'their-secret-key' },
        1,
        20,
      );
    });
  });

  describe('getSensorNode / createVideoSession / getRecordings / getImageAnalyticsEvent', () => {
    it('getSensorNode delegates to SensorNodesClient', async () => {
      const sensorNodesClient = {
        listSensorNodes: jest.fn(),
        getSensorNode: jest.fn().mockResolvedValue({ id: 'node-1' }),
      };
      const service = buildService({ sensorNodesClient });

      const result = await service.getSensorNode('peer-1', 'node-1');

      expect(result).toEqual({ id: 'node-1' });
      expect(sensorNodesClient.getSensorNode).toHaveBeenCalledWith(
        { baseUrl: 'https://acme.example.test', apiKey: 'their-secret-key' },
        'node-1',
      );
    });

    it('createVideoSession delegates to VideoClient with the request body', async () => {
      const session = { streamUrl: 'https://acme.example.test/x.m3u8', expiresIn: 300 };
      const videoClient = {
        createSession: jest.fn().mockResolvedValue(session),
        getRecordings: jest.fn(),
      };
      const service = buildService({ videoClient });
      const body = { startDate: '2026-01-01T00:00:00Z' };

      const result = await service.createVideoSession('peer-1', 'node-1', body);

      expect(result).toEqual(session);
      expect(videoClient.createSession).toHaveBeenCalledWith(
        { baseUrl: 'https://acme.example.test', apiKey: 'their-secret-key' },
        'node-1',
        body,
      );
    });

    it('getRecordings delegates to VideoClient', async () => {
      const catalog = { firstClipDate: 'a', lastClipDate: 'b', discontinuities: [] };
      const videoClient = {
        createSession: jest.fn(),
        getRecordings: jest.fn().mockResolvedValue(catalog),
      };
      const service = buildService({ videoClient });

      const result = await service.getRecordings('peer-1', 'node-1');

      expect(result).toEqual(catalog);
    });

    it('getImageAnalyticsEvent delegates to ImageAnalyticsClient', async () => {
      const imageAnalyticsClient = {
        getEvent: jest.fn().mockResolvedValue({ eventId: 'event-1' }),
      };
      const service = buildService({ imageAnalyticsClient });

      const result = await service.getImageAnalyticsEvent('peer-1', 'event-1');

      expect(result).toEqual({ eventId: 'event-1' });
    });
  });

  describe('outbound rate limit', () => {
    it('fails fast with a 429 once the peer outbound quota is exhausted, without ever calling the client', async () => {
      const rateLimiter = new RateLimiterService();
      for (let i = 0; i < 100; i += 1) {
        await rateLimiter.consume('peer-1', 'out');
      }

      const imageAnalyticsClient = { getEvent: jest.fn() };
      const service = buildService({ rateLimiter, imageAnalyticsClient });

      await expect(service.getImageAnalyticsEvent('peer-1', 'event-1')).rejects.toThrow(
        HttpException,
      );
      expect(imageAnalyticsClient.getEvent).not.toHaveBeenCalled();

      try {
        await service.getImageAnalyticsEvent('peer-1', 'event-1');
        throw new Error('expected rejection');
      } catch (error) {
        expect(error).toBeInstanceOf(HttpException);
        const httpError = error as HttpException;
        expect(httpError.getStatus()).toBe(HttpStatus.TOO_MANY_REQUESTS);
        const response = httpError.getResponse() as { retryAfterSeconds?: number };
        expect(typeof response.retryAfterSeconds).toBe('number');
      }
    });
  });

  describe('retry policy', () => {
    it('retries once on failure, per the fixed outbound-client retry policy, and returns the eventual success', async () => {
      jest.useFakeTimers();
      const imageAnalyticsClient = {
        getEvent: jest
          .fn()
          .mockRejectedValueOnce(new Error('transient failure'))
          .mockResolvedValueOnce({ eventId: 'event-1' }),
      };
      const service = buildService({ imageAnalyticsClient });

      const promise = service.getImageAnalyticsEvent('peer-1', 'event-1');
      await jest.advanceTimersByTimeAsync(2_000);
      const result = await promise;

      expect(result).toEqual({ eventId: 'event-1' });
      expect(imageAnalyticsClient.getEvent).toHaveBeenCalledTimes(2);
    });

    it('gives up after the fixed maxAttempts (3) and rejects with the last error', async () => {
      jest.useFakeTimers();
      const finalError = new Error('still failing');
      const imageAnalyticsClient = {
        getEvent: jest
          .fn()
          .mockRejectedValueOnce(new Error('first failure'))
          .mockRejectedValueOnce(new Error('second failure'))
          .mockRejectedValueOnce(finalError),
      };
      const service = buildService({ imageAnalyticsClient });

      const promise = service.getImageAnalyticsEvent('peer-1', 'event-1');
      promise.catch(() => undefined);
      await jest.advanceTimersByTimeAsync(5_000);

      await expect(promise).rejects.toThrow(finalError);
      expect(imageAnalyticsClient.getEvent).toHaveBeenCalledTimes(3);
    });
  });
});
