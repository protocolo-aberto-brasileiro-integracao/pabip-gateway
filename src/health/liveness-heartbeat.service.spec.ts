import { LivenessHeartbeatService } from './liveness-heartbeat.service';
import { LIVENESS_HEARTBEAT_INTERVAL_MS, LIVENESS_MAX_LAG_MS } from './health.constants';

describe('LivenessHeartbeatService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('is responsive immediately after init, before any tick has elapsed', () => {
    const service = new LivenessHeartbeatService();
    service.onModuleInit();

    expect(service.isResponsive()).toBe(true);
  });

  it('stays responsive across ticks that keep up with the heartbeat interval', () => {
    const service = new LivenessHeartbeatService();
    service.onModuleInit();

    jest.advanceTimersByTime(LIVENESS_HEARTBEAT_INTERVAL_MS * 3);

    expect(service.isResponsive()).toBe(true);
  });

  it('becomes unresponsive once the last tick is older than the max lag', () => {
    const service = new LivenessHeartbeatService();
    service.onModuleInit();

    jest.setSystemTime(Date.now() + LIVENESS_MAX_LAG_MS + 1);

    expect(service.isResponsive()).toBe(false);
  });

  it('stops ticking once destroyed', () => {
    const service = new LivenessHeartbeatService();
    service.onModuleInit();
    service.onModuleDestroy();

    jest.setSystemTime(Date.now() + LIVENESS_MAX_LAG_MS + 1);

    expect(service.isResponsive()).toBe(false);
  });
});
