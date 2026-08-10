import { Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';
import { ClientTokensAdminController } from './controllers/client-tokens.controller';
import { ConfigAdminController } from './controllers/config.controller';
import { OperationLogAdminController } from './controllers/operation-log.controller';
import { PassthroughController } from './controllers/passthrough.controller';
import { PeersAdminController } from './controllers/peers.controller';
import { TokensAdminController } from './controllers/tokens.controller';

@Module({
  imports: [ConfigModule, RateLimiterModule],
  controllers: [
    PeersAdminController,
    TokensAdminController,
    ClientTokensAdminController,
    ConfigAdminController,
    OperationLogAdminController,
    PassthroughController,
  ],
})
export class AdminApiModule {}
