import { Global, Module } from '@nestjs/common';
import { DELIVERY_METRICS_RECORDER } from '../output-sink/delivery-metrics.tokens';
import { BootStatusService } from './boot-status.service';
import { DrainingStateService } from './draining-state.service';
import { HealthController } from './health.controller';
import { LivenessHeartbeatService } from './liveness-heartbeat.service';
import { MetricsController } from './metrics.controller';
import { MetricsService } from './metrics.service';

@Global()
@Module({
  controllers: [HealthController, MetricsController],
  providers: [
    MetricsService,
    LivenessHeartbeatService,
    DrainingStateService,
    BootStatusService,
    { provide: DELIVERY_METRICS_RECORDER, useExisting: MetricsService },
  ],
  exports: [
    MetricsService,
    LivenessHeartbeatService,
    DrainingStateService,
    BootStatusService,
    DELIVERY_METRICS_RECORDER,
  ],
})
export class HealthModule {}
