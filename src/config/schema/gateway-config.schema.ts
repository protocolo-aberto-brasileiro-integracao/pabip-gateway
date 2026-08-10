import { Type } from 'class-transformer';
import { ValidateNested } from 'class-validator';
import { AuditConfigDto } from './audit.config.dto';
import { CircuitBreakerConfigDto } from './circuit-breaker.config.dto';
import { DatabaseConfigDto } from './database.config.dto';
import { DeliveryConfigDto } from './delivery.config.dto';
import { GatewayConfigDto } from './gateway.config.dto';
import { LoggingConfigDto } from './logging.config.dto';
import { OutputConfigDto } from './output.config.dto';
import { PeerOnboardingConfigDto } from './peer-onboarding.config.dto';
import { RetryConfigDto } from './retry.config.dto';
import { ShutdownConfigDto } from './shutdown.config.dto';

export class GatewayConfigSchema {
  @ValidateNested()
  @Type(() => DatabaseConfigDto)
  database!: DatabaseConfigDto;

  @ValidateNested()
  @Type(() => GatewayConfigDto)
  gateway!: GatewayConfigDto;

  @ValidateNested()
  @Type(() => DeliveryConfigDto)
  delivery!: DeliveryConfigDto;

  @ValidateNested()
  @Type(() => ShutdownConfigDto)
  shutdown!: ShutdownConfigDto;

  @ValidateNested()
  @Type(() => OutputConfigDto)
  output!: OutputConfigDto;

  @ValidateNested()
  @Type(() => LoggingConfigDto)
  logging!: LoggingConfigDto;

  @ValidateNested()
  @Type(() => CircuitBreakerConfigDto)
  circuitBreaker!: CircuitBreakerConfigDto;

  @ValidateNested()
  @Type(() => RetryConfigDto)
  retry!: RetryConfigDto;

  @ValidateNested()
  @Type(() => AuditConfigDto)
  audit!: AuditConfigDto;

  @ValidateNested()
  @Type(() => PeerOnboardingConfigDto)
  peerOnboarding!: PeerOnboardingConfigDto;
}
