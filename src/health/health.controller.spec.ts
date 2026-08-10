import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';

function buildController(overrides: {
  isResponsive?: boolean;
  hasInitialSnapshot?: boolean;
  isDraining?: boolean;
  isConfigMigrated?: boolean;
}) {
  const liveness = { isResponsive: jest.fn().mockReturnValue(overrides.isResponsive ?? true) };
  const peerCache = {
    hasInitialSnapshot: jest.fn().mockReturnValue(overrides.hasInitialSnapshot ?? true),
  };
  const drainingState = { isDraining: jest.fn().mockReturnValue(overrides.isDraining ?? false) };
  const bootStatus = {
    isConfigMigrated: jest.fn().mockReturnValue(overrides.isConfigMigrated ?? true),
  };
  const controller = new HealthController(
    liveness as never,
    peerCache as never,
    drainingState as never,
    bootStatus as never,
  );
  return { controller, liveness, peerCache, drainingState, bootStatus };
}

describe('HealthController', () => {
  describe('checkLiveness (/healthz)', () => {
    it('returns ok when the event loop heartbeat is responsive', () => {
      const { controller } = buildController({ isResponsive: true });
      expect(controller.checkLiveness()).toEqual({ status: 'ok' });
    });

    it('throws ServiceUnavailableException when the heartbeat has stalled', () => {
      const { controller } = buildController({ isResponsive: false });
      expect(() => controller.checkLiveness()).toThrow(ServiceUnavailableException);
    });
  });

  describe('checkReadiness (/readyz)', () => {
    it('returns ready once config is migrated, the initial peer snapshot has loaded, and the process is not draining', () => {
      const { controller } = buildController({
        hasInitialSnapshot: true,
        isDraining: false,
        isConfigMigrated: true,
      });
      expect(controller.checkReadiness()).toEqual({ status: 'ready' });
    });

    it('throws ServiceUnavailableException before config migration into gateway_config has completed', () => {
      const { controller } = buildController({ isConfigMigrated: false });
      expect(() => controller.checkReadiness()).toThrow(ServiceUnavailableException);
    });

    it('throws ServiceUnavailableException before the initial peer snapshot has loaded', () => {
      const { controller } = buildController({ hasInitialSnapshot: false });
      expect(() => controller.checkReadiness()).toThrow(ServiceUnavailableException);
    });

    it('throws ServiceUnavailableException while the process is draining', () => {
      const { controller } = buildController({ hasInitialSnapshot: true, isDraining: true });
      expect(() => controller.checkReadiness()).toThrow(ServiceUnavailableException);
    });
  });
});
