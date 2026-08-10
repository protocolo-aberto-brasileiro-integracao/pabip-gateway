import { Inject, Injectable, Logger, OnApplicationBootstrap, Optional } from '@nestjs/common';
import { ConfigMigrationService } from './config-migration.service';
import { resolveAdminTokensSeed, resolvePeerSeed } from './config-file.loader';
import {
  ADMIN_TOKEN_SEED_WRITER,
  PEER_SEED_WRITER,
  type AdminTokenSeedWriter,
  type PeerSeedWriter,
} from './entity-seed.tokens';

@Injectable()
export class EntitySeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(EntitySeedService.name);

  constructor(
    private readonly configMigration: ConfigMigrationService,
    @Optional() @Inject(PEER_SEED_WRITER) private readonly peerSeedWriter?: PeerSeedWriter,
    @Optional()
    @Inject(ADMIN_TOKEN_SEED_WRITER)
    private readonly adminTokenSeedWriter?: AdminTokenSeedWriter,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await this.seedPeers();
    await this.seedAdminTokens();
  }

  private async seedPeers(): Promise<void> {
    const peers = resolvePeerSeed();
    if (peers.length === 0) {
      return;
    }

    if (!this.peerSeedWriter) {
      this.logger.warn(
        `Found ${peers.length} peer(s) in the config file seed, but no peer seed writer is bound yet ` +
          '(the "peers" module is not wired in) — skipping.',
      );
      return;
    }

    await this.peerSeedWriter.seedPeers(peers);
  }

  private async seedAdminTokens(): Promise<void> {
    const tokens = resolveAdminTokensSeed();

    if (!this.adminTokenSeedWriter) {
      if (tokens.length > 0) {
        this.logger.warn(
          `Found ${tokens.length} admin token(s) in the config file/ENV seed, but no admin token seed ` +
            'writer is bound yet (the "auth" module is not wired in) — skipping.',
        );
      }
      return;
    }

    await this.adminTokenSeedWriter.seedAdminTokens(tokens);
  }
}
