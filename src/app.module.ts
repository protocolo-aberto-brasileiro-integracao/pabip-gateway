import { Module, type MiddlewareConsumer, type NestModule } from '@nestjs/common';
import { PassthroughController } from './admin-api/controllers/passthrough.controller';
import { RequestIdMiddleware } from './common/request-id.middleware';
import { IngestionController } from './ingestion/ingestion.controller';
import { AdminApiModule } from './admin-api/admin-api.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { CircuitBreakerModule } from './circuit-breaker/circuit-breaker.module';
import { ShutdownModule } from './common/shutdown.module';
import { ConfigModule } from './config/config.module';
import { HealthModule } from './health/health.module';
import { IngestionModule } from './ingestion/ingestion.module';
import { OperationLogModule } from './operation-log/operation-log.module';
import { OutboundClientModule } from './outbound-client/outbound-client.module';
import { OutputSinkModule } from './output-sink/output-sink.module';
import { PeersModule } from './peers/peers.module';
import { PrismaModule } from './prisma/prisma.module';
import { RateLimiterModule } from './rate-limiter/rate-limiter.module';

@Module({
  imports: [
    PrismaModule,
    ConfigModule,
    AuthModule,
    PeersModule,
    CircuitBreakerModule,
    RateLimiterModule,
    OutputSinkModule,
    IngestionModule,
    OutboundClientModule,
    AdminApiModule,
    AuditModule,
    OperationLogModule,
    HealthModule,
    ShutdownModule,
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes(IngestionController, PassthroughController);
  }
}
