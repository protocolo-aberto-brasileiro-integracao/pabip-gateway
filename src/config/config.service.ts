import { Injectable } from '@nestjs/common';
import { ConfigCacheService } from './config-cache.service';
import type { AuditConfigDto } from './schema/audit.config.dto';
import type { CircuitBreakerConfigDto } from './schema/circuit-breaker.config.dto';
import type { DatabaseConfigDto } from './schema/database.config.dto';
import type { DeliveryConfigDto } from './schema/delivery.config.dto';
import type { GatewayConfigDto } from './schema/gateway.config.dto';
import type { LoggingConfigDto } from './schema/logging.config.dto';
import type { OutputConfigDto } from './schema/output.config.dto';
import type { PeerOnboardingConfigDto } from './schema/peer-onboarding.config.dto';
import type { RetryConfigDto } from './schema/retry.config.dto';
import type { ShutdownConfigDto } from './schema/shutdown.config.dto';

@Injectable()
export class ConfigService {
  constructor(private readonly cache: ConfigCacheService) {}

  write(key: string, value: unknown): Promise<void> {
    return this.cache.writeApiValue(key, value);
  }

  get database(): DatabaseConfigDto {
    return this.cache.getSchema().database;
  }

  get gateway(): GatewayConfigDto {
    return this.cache.getSchema().gateway;
  }

  get delivery(): DeliveryConfigDto {
    return this.cache.getSchema().delivery;
  }

  get shutdown(): ShutdownConfigDto {
    return this.cache.getSchema().shutdown;
  }

  get output(): OutputConfigDto {
    return this.cache.getSchema().output;
  }

  get logging(): LoggingConfigDto {
    return this.cache.getSchema().logging;
  }

  get circuitBreaker(): CircuitBreakerConfigDto {
    return this.cache.getSchema().circuitBreaker;
  }

  get retry(): RetryConfigDto {
    return this.cache.getSchema().retry;
  }

  get audit(): AuditConfigDto {
    return this.cache.getSchema().audit;
  }

  get peerOnboarding(): PeerOnboardingConfigDto {
    return this.cache.getSchema().peerOnboarding;
  }
}
