import { Global, Module } from '@nestjs/common';
import { ConfigModule } from '../config/config.module';
import { PEER_REMOVAL_LISTENER } from '../peers/peer-removal.tokens';
import { CircuitBreakerRegistry } from './circuit-breaker.registry';
import { CircuitBreakerService } from './circuit-breaker.service';

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    CircuitBreakerRegistry,
    CircuitBreakerService,
    { provide: PEER_REMOVAL_LISTENER, useExisting: CircuitBreakerService },
  ],
  exports: [CircuitBreakerService, PEER_REMOVAL_LISTENER],
})
export class CircuitBreakerModule {}
