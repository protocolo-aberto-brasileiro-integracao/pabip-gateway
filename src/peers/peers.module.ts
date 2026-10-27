import { HttpModule } from '@nestjs/axios';
import { Global, Module } from '@nestjs/common';
import { EgressPolicyModule } from '../common/security/egress-policy.module';
import { SecretCipherModule } from '../common/security/secret-cipher.module';
import { ConfigModule } from '../config/config.module';
import { PEER_SEED_WRITER } from '../config/entity-seed.tokens';
import { PrismaModule } from '../prisma/prisma.module';
import { OnboardingService } from './onboarding.service';
import { PeerCacheService } from './peer-cache.service';
import { PeersService } from './peers.service';

@Global()
@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    HttpModule.register({ maxRedirects: 0 }),
    EgressPolicyModule,
    SecretCipherModule,
  ],
  providers: [
    PeersService,
    PeerCacheService,
    OnboardingService,
    { provide: PEER_SEED_WRITER, useExisting: PeersService },
  ],
  exports: [PeersService, PeerCacheService, PEER_SEED_WRITER],
})
export class PeersModule {}
