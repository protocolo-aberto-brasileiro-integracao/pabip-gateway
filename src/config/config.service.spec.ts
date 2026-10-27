import type { ConfigCacheService } from './config-cache.service';
import { ConfigService } from './config.service';
import type { GatewayConfigSchema } from './schema/gateway-config.schema';

describe('ConfigService', () => {
  it('exposes one typed getter per section, all reading from the cache', () => {
    const schema = {
      database: { url: 'postgresql://x' },
      gateway: { devMode: false },
      delivery: { maxAttempts: 3 },
      shutdown: { gracePeriodSeconds: 90 },
      output: { type: 'callback' },
      logging: { level: 'info' },
      circuitBreaker: { errorThreshold: 0.5 },
      retry: { maxAttempts: 5 },
      audit: { sink: 'stdout' },
      peerOnboarding: { onboardingValidationTimeoutMs: 5000 },
      egress: { requireHttps: true, allowPrivateDestinations: false },
      security: { secretEncryptionKey: undefined },
    } as unknown as GatewayConfigSchema;

    const cache: Pick<ConfigCacheService, 'getSchema'> = { getSchema: () => schema };
    const service = new ConfigService(cache as ConfigCacheService);

    expect(service.database).toBe(schema.database);
    expect(service.gateway).toBe(schema.gateway);
    expect(service.delivery).toBe(schema.delivery);
    expect(service.shutdown).toBe(schema.shutdown);
    expect(service.output).toBe(schema.output);
    expect(service.logging).toBe(schema.logging);
    expect(service.circuitBreaker).toBe(schema.circuitBreaker);
    expect(service.retry).toBe(schema.retry);
    expect(service.audit).toBe(schema.audit);
    expect(service.peerOnboarding).toBe(schema.peerOnboarding);
    expect(service.egress).toBe(schema.egress);
    expect(service.security).toBe(schema.security);
  });

  it('write() forwards to ConfigCacheService.writeApiValue()', async () => {
    const writeApiValue = jest.fn().mockResolvedValue(undefined);
    const cache: Pick<ConfigCacheService, 'writeApiValue'> = { writeApiValue };
    const service = new ConfigService(cache as ConfigCacheService);

    await service.write('logging.level', 'debug');

    expect(writeApiValue).toHaveBeenCalledWith('logging.level', 'debug');
  });
});
