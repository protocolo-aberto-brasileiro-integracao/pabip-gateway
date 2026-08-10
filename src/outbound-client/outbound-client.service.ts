import { HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  ImageAnalyticsClient,
  SensorNodesClient,
  VideoClient,
  type PabipPeerConnection,
  type RecordingsCatalog,
  type SensorNodeListing,
  type VideoSession,
  type VideoSessionRequest,
} from '@protocolo-aberto-brasileiro-integracao/pabip-sdk';
import type { OutboundClientPort } from '../admin-api/outbound-client.port';
import { CircuitBreakerService } from '../circuit-breaker/circuit-breaker.service';
import { withRetry } from '../common/retry.util';
import type { CachedPeer } from '../peers/peer-cache.service';
import { PeersService } from '../peers/peers.service';
import { RateLimiterService } from '../rate-limiter/rate-limiter.service';
import { ListingCacheService } from './listing-cache.service';
import { OUTBOUND_CLIENT_RETRY_OPTIONS } from './outbound-client.constants';

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 20;

@Injectable()
export class OutboundClientService implements OutboundClientPort {
  private readonly logger = new Logger(OutboundClientService.name);

  constructor(
    private readonly peers: PeersService,
    private readonly rateLimiter: RateLimiterService,
    private readonly circuitBreaker: CircuitBreakerService,
    private readonly sensorNodesClient: SensorNodesClient,
    private readonly videoClient: VideoClient,
    private readonly imageAnalyticsClient: ImageAnalyticsClient,
    private readonly listingCache: ListingCacheService,
  ) {}

  async listSensorNodes(
    peerId: string,
    page = DEFAULT_PAGE,
    pageSize = DEFAULT_PAGE_SIZE,
  ): Promise<SensorNodeListing> {
    const peer = this.resolvePeer(peerId);

    const cached = this.listingCache.get(peerId, page, pageSize);
    if (cached) {
      return cached;
    }

    const result = await this.callPeer(peer, () =>
      this.sensorNodesClient.listSensorNodes(toPeerConnection(peer), page, pageSize),
    );
    this.listingCache.set(peerId, page, pageSize, result);
    return result;
  }

  async getSensorNode(peerId: string, nodeId: string): Promise<unknown> {
    const peer = this.resolvePeer(peerId);
    return this.callPeer(
      peer,
      () => this.sensorNodesClient.getSensorNode(toPeerConnection(peer), nodeId),
      { nodeId },
    );
  }

  async createVideoSession(
    peerId: string,
    nodeId: string,
    body: VideoSessionRequest,
  ): Promise<VideoSession> {
    const peer = this.resolvePeer(peerId);
    return this.callPeer(
      peer,
      () => this.videoClient.createSession(toPeerConnection(peer), nodeId, body),
      { nodeId },
    );
  }

  async getRecordings(peerId: string, nodeId: string): Promise<RecordingsCatalog> {
    const peer = this.resolvePeer(peerId);
    return this.callPeer(
      peer,
      () => this.videoClient.getRecordings(toPeerConnection(peer), nodeId),
      {
        nodeId,
      },
    );
  }

  async getImageAnalyticsEvent(peerId: string, eventId: string): Promise<unknown> {
    const peer = this.resolvePeer(peerId);
    return this.callPeer(
      peer,
      () => this.imageAnalyticsClient.getEvent(toPeerConnection(peer), eventId),
      { eventId },
    );
  }

  private resolvePeer(peerId: string): CachedPeer {
    const peer = this.peers.resolve(peerId);
    if (!peer) {
      throw new NotFoundException(`Peer "${peerId}" not found.`);
    }
    return peer;
  }

  private async callPeer<T>(
    peer: CachedPeer,
    fn: () => Promise<T>,
    context?: Record<string, string>,
  ): Promise<T> {
    const quota = await this.rateLimiter.consume(peer.id, 'out');
    if (!quota.allowed) {
      throw new HttpException(
        {
          message: `Outbound rate limit exceeded for peer "${peer.id}".`,
          retryAfterSeconds: quota.retryAfterSeconds,
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return withRetry(() => this.circuitBreaker.execute(peer.id, 'outbound', fn), {
      ...OUTBOUND_CLIENT_RETRY_OPTIONS,
      onAttemptFailure: (error, attempt, nextDelayMs) => {
        this.logger.warn(
          `Outbound call attempt ${attempt} failed for peer "${peer.id}" ` +
            `(${describeError(error)}) — retrying in ~${Math.round(nextDelayMs)}ms.`,
          { peerId: peer.id, ...context },
        );
      },
    });
  }
}

function toPeerConnection(peer: CachedPeer): PabipPeerConnection {
  return { baseUrl: peer.baseUrl, apiKey: peer.theirApiKey };
}

function describeError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}
