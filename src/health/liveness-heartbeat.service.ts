import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { LIVENESS_HEARTBEAT_INTERVAL_MS, LIVENESS_MAX_LAG_MS } from './health.constants';

@Injectable()
export class LivenessHeartbeatService implements OnModuleInit, OnModuleDestroy {
  private lastTickAt = Date.now();
  private handle?: ReturnType<typeof setInterval>;

  onModuleInit(): void {
    this.handle = setInterval(() => {
      this.lastTickAt = Date.now();
    }, LIVENESS_HEARTBEAT_INTERVAL_MS);
    this.handle.unref();
  }

  onModuleDestroy(): void {
    if (this.handle) {
      clearInterval(this.handle);
      this.handle = undefined;
    }
  }

  isResponsive(): boolean {
    return Date.now() - this.lastTickAt < LIVENESS_MAX_LAG_MS;
  }
}
