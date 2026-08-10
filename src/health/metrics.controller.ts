import { Controller, Get, Header } from '@nestjs/common';
import { Registry } from 'prom-client';
import { MetricsService } from './metrics.service';

@Controller()
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Get('metrics')
  @Header('Content-Type', Registry.PROMETHEUS_CONTENT_TYPE)
  getMetrics(): Promise<string> {
    return this.metricsService.metrics();
  }
}
