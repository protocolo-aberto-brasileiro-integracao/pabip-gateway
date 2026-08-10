import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PeerCacheService } from '../peers/peer-cache.service';
import { BootStatusService } from './boot-status.service';
import { DrainingStateService } from './draining-state.service';
import { LivenessHeartbeatService } from './liveness-heartbeat.service';

@Controller()
export class HealthController {
  constructor(
    private readonly liveness: LivenessHeartbeatService,
    private readonly peerCache: PeerCacheService,
    private readonly drainingState: DrainingStateService,
    private readonly bootStatus: BootStatusService,
  ) {}

  @Get('healthz')
  checkLiveness(): { status: 'ok' } {
    if (!this.liveness.isResponsive()) {
      throw new ServiceUnavailableException('Event loop heartbeat is stalled.');
    }
    return { status: 'ok' };
  }

  @Get('readyz')
  checkReadiness(): { status: 'ready' } {
    if (!this.bootStatus.isConfigMigrated()) {
      throw new ServiceUnavailableException(
        'Config has not been reconciled into gateway_config yet.',
      );
    }
    if (!this.peerCache.hasInitialSnapshot()) {
      throw new ServiceUnavailableException('Initial peer registry snapshot not loaded yet.');
    }
    if (this.drainingState.isDraining()) {
      throw new ServiceUnavailableException('Process is draining for shutdown.');
    }
    return { status: 'ready' };
  }
}
