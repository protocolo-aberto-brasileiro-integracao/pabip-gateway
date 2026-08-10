import { MetricsController } from './metrics.controller';

describe('MetricsController', () => {
  it('returns whatever MetricsService.metrics() resolves with', async () => {
    const metricsService = {
      metrics: jest.fn().mockResolvedValue('gateway_delivery_failed_total 0\n'),
    };
    const controller = new MetricsController(metricsService as never);

    await expect(controller.getMetrics()).resolves.toBe('gateway_delivery_failed_total 0\n');
  });
});
