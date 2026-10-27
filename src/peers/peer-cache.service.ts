import {
  Inject,
  Injectable,
  Logger,
  Optional,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DbChangeNotifier } from '../common/db-change-notifier';
import { registerSecret } from '../common/logging/secret-redactor';
import { SecretCipherService } from '../common/security/secret-cipher.service';
import { PrismaService } from '../prisma/prisma.service';
import { PEER_REMOVAL_LISTENER, type PeerRemovalListener } from './peer-removal.tokens';
import {
  PEER_STORE_STATUS_LISTENER,
  type PeerStoreStatusListener,
} from './peer-store-status.tokens';
import { PEERS_CHANGED_CHANNEL, PEERS_POLL_INTERVAL_MS } from './peers.constants';

export interface CachedPeer {
  id: string;
  name: string;
  baseUrl: string;
  theirApiKey: string;
  apiKeyHash: string;
  scopes: string[];
  ipAllowlist: string[];
  capabilities: string[];
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class PeerCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PeerCacheService.name);
  private byId = new Map<string, CachedPeer>();
  private byApiKeyHash = new Map<string, CachedPeer>();
  private notifier?: DbChangeNotifier;
  private hasLoadedOnce = false;
  private storeAvailable = true;

  constructor(
    private readonly prisma: PrismaService,
    @Optional()
    @Inject(PEER_REMOVAL_LISTENER)
    private readonly removalListener?: PeerRemovalListener,
    @Optional()
    @Inject(PEER_STORE_STATUS_LISTENER)
    private readonly storeStatusListener?: PeerStoreStatusListener,
    @Optional()
    private readonly secretCipher?: SecretCipherService,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.reload();

    this.notifier = new DbChangeNotifier({
      channel: PEERS_CHANGED_CHANNEL,
      connectionString: this.prisma.databaseUrl,
      pollIntervalMs: PEERS_POLL_INTERVAL_MS,
      onChange: () => this.reload(),
      logger: this.logger,
    });
    await this.notifier.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.notifier?.stop();
  }

  getByApiKeyHash(apiKeyHash: string): CachedPeer | undefined {
    return this.byApiKeyHash.get(apiKeyHash);
  }

  getById(peerId: string): CachedPeer | undefined {
    return this.byId.get(peerId);
  }

  list(): CachedPeer[] {
    return [...this.byId.values()];
  }

  hasInitialSnapshot(): boolean {
    return this.hasLoadedOnce;
  }

  isStoreAvailable(): boolean {
    return this.storeAvailable;
  }

  async reload(): Promise<void> {
    const previousIds = new Set(this.byId.keys());

    try {
      const rows = await this.prisma.peer.findMany();
      this.hasLoadedOnce = true;
      this.markStoreAvailable();

      const byId = new Map<string, CachedPeer>();
      const byApiKeyHash = new Map<string, CachedPeer>();
      for (const row of rows) {
        const theirApiKey =
          this.secretCipher?.decryptFromStorage(row.theirApiKey) ?? row.theirApiKey;
        registerSecret(theirApiKey);
        const record: CachedPeer = { ...row, theirApiKey };
        byId.set(row.id, record);
        byApiKeyHash.set(row.apiKeyHash, record);
      }

      this.byId = byId;
      this.byApiKeyHash = byApiKeyHash;

      if (this.removalListener) {
        for (const id of previousIds) {
          if (!byId.has(id)) {
            this.removalListener.onPeerRemoved(id);
          }
        }
      }
    } catch (error) {
      if (!this.hasLoadedOnce) {
        throw error;
      }
      this.markStoreUnavailable(error);
    }
  }

  private markStoreUnavailable(error: unknown): void {
    if (!this.storeAvailable) {
      return;
    }
    this.storeAvailable = false;
    this.logger.error(
      'Peer registry database unreachable; continuing to serve reads from the last cached snapshot.',
      error instanceof Error ? error.stack : String(error),
    );
    this.storeStatusListener?.onPeerStoreAvailabilityChanged(false);
  }

  private markStoreAvailable(): void {
    if (this.storeAvailable) {
      return;
    }
    this.storeAvailable = true;
    this.logger.log('Peer registry database reachable again.');
    this.storeStatusListener?.onPeerStoreAvailabilityChanged(true);
  }
}
