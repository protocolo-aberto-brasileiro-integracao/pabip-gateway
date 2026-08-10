import { BadRequestException } from '@nestjs/common';
import { ConfigAdminController } from './config.controller';

function buildConfigServiceMock(write: jest.Mock) {
  return {
    database: { url: 'postgresql://user:pass@host/db' },
    gateway: { devMode: false, entePublicoName: 'acme', publicPort: 8080, adminPort: 8081 },
    delivery: { maxConcurrentPerPeer: 20, maxAttempts: 3, windowSeconds: 60 },
    shutdown: { gracePeriodSeconds: 90 },
    output: {
      type: 'callback',
      callback: { url: '', headers: {} },
      queue: { routingKeyTemplate: 'x', brokerUrl: 'amqp://user:pass@broker' },
      db: { connectionString: 'postgresql://out' },
    },
    logging: { level: 'info' },
    circuitBreaker: { errorThreshold: 0.5, windowSeconds: 30 },
    retry: { maxAttempts: 5, baseDelayMs: 500, jitterPct: 20 },
    audit: { sink: 'stdout', retentionDays: 180 },
    peerOnboarding: { onboardingValidationTimeoutMs: 5000 },
    write,
  };
}

describe('ConfigAdminController', () => {
  let write: jest.Mock;
  let controller: ConfigAdminController;

  beforeEach(() => {
    write = jest.fn().mockResolvedValue(undefined);
    controller = new ConfigAdminController(buildConfigServiceMock(write) as never);
  });

  describe('read', () => {
    it('redacts every sensitive field', () => {
      const snapshot = controller.read();
      expect(snapshot.database.url).toBe('[REDACTED]');
      expect(snapshot.output.queue.brokerUrl).toBe('[REDACTED]');
      expect(snapshot.output.db.connectionString).toBe('[REDACTED]');
    });

    it('leaves non-sensitive fields untouched', () => {
      const snapshot = controller.read();
      expect(snapshot.logging.level).toBe('info');
      expect(snapshot.delivery.maxConcurrentPerPeer).toBe(20);
    });

    it('never mutates the live config objects backing ConfigService', () => {
      const configService = buildConfigServiceMock(write);
      const localController = new ConfigAdminController(configService as never);

      localController.read();

      expect(configService.database.url).toBe('postgresql://user:pass@host/db');
      expect(configService.output.queue.brokerUrl).toBe('amqp://user:pass@broker');
    });
  });

  describe('update', () => {
    it('writes each apiWritable key and returns a refreshed, redacted snapshot', async () => {
      const snapshot = await controller.update({
        values: { 'delivery.maxConcurrentPerPeer': 30, 'logging.level': 'debug' },
      });

      expect(write).toHaveBeenCalledWith('delivery.maxConcurrentPerPeer', 30);
      expect(write).toHaveBeenCalledWith('logging.level', 'debug');
      expect(snapshot.database.url).toBe('[REDACTED]');
    });

    it('rejects an unknown key without writing anything', async () => {
      await expect(controller.update({ values: { 'not.a.real.key': 1 } })).rejects.toThrow(
        BadRequestException,
      );
      expect(write).not.toHaveBeenCalled();
    });

    it('rejects a boot-only key without writing anything', async () => {
      await expect(
        controller.update({ values: { 'database.url': 'postgresql://x' } }),
      ).rejects.toThrow(BadRequestException);
      expect(write).not.toHaveBeenCalled();
    });

    it('rejects a value of the wrong type without writing anything', async () => {
      await expect(
        controller.update({ values: { 'delivery.maxConcurrentPerPeer': 'not-a-number' } }),
      ).rejects.toThrow(BadRequestException);
      expect(write).not.toHaveBeenCalled();
    });

    it('validates every key before writing any of them (all-or-nothing)', async () => {
      await expect(
        controller.update({
          values: { 'logging.level': 'debug', 'not.a.real.key': 1 },
        }),
      ).rejects.toThrow(BadRequestException);
      expect(write).not.toHaveBeenCalled();
    });
  });
});
