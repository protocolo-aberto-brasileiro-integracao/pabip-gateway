import { Global, Module } from '@nestjs/common';
import { ADMIN_TOKEN_SEED_WRITER } from '../config/entity-seed.tokens';
import { PrismaModule } from '../prisma/prisma.module';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';
import { AdminTokenService } from './admin-token.service';
import { ClientTokenService } from './client-token.service';
import { AdminTokenGuard } from './guards/admin-token.guard';
import { ApiKeyGuard } from './guards/api-key.guard';
import { IpAllowlistGuard } from './guards/ip-allowlist.guard';
import { PeersAccessGuard } from './guards/peers-access.guard';
import { KeyIssuanceService } from './key-issuance.service';

@Global()
@Module({
  imports: [PrismaModule, RateLimiterModule],
  providers: [
    KeyIssuanceService,
    AdminTokenService,
    ClientTokenService,
    ApiKeyGuard,
    AdminTokenGuard,
    IpAllowlistGuard,
    PeersAccessGuard,
    { provide: ADMIN_TOKEN_SEED_WRITER, useExisting: AdminTokenService },
  ],
  exports: [
    KeyIssuanceService,
    AdminTokenService,
    ClientTokenService,
    ApiKeyGuard,
    AdminTokenGuard,
    IpAllowlistGuard,
    PeersAccessGuard,
    ADMIN_TOKEN_SEED_WRITER,
  ],
})
export class AuthModule {}
