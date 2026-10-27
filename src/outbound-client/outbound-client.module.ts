import { Agent as HttpAgent } from 'node:http';
import { Agent as HttpsAgent } from 'node:https';
import { Global, Module } from '@nestjs/common';
import {
  ImageAnalyticsClient,
  SensorNodesClient,
  VideoClient,
} from '@protocolo-aberto-brasileiro-integracao/pabip-sdk';
import axios from 'axios';
import { OUTBOUND_CLIENT } from '../admin-api/outbound-client.port';
import { RateLimiterModule } from '../rate-limiter/rate-limiter.module';
import { ListingCacheService } from './listing-cache.service';
import {
  OUTBOUND_CLIENT_MAX_SOCKETS,
  OUTBOUND_CLIENT_TIMEOUT_MS,
} from './outbound-client.constants';
import { OutboundClientService } from './outbound-client.service';

const httpAgent = new HttpAgent({ keepAlive: true, maxSockets: OUTBOUND_CLIENT_MAX_SOCKETS });
const httpsAgent = new HttpsAgent({ keepAlive: true, maxSockets: OUTBOUND_CLIENT_MAX_SOCKETS });
const http = axios.create({
  httpAgent,
  httpsAgent,
  timeout: OUTBOUND_CLIENT_TIMEOUT_MS,
  maxRedirects: 0,
});
http.interceptors.request.use((config) => {
  config.timeout = OUTBOUND_CLIENT_TIMEOUT_MS;
  return config;
});

@Global()
@Module({
  imports: [RateLimiterModule],
  providers: [
    OutboundClientService,
    { provide: SensorNodesClient, useValue: new SensorNodesClient(http) },
    { provide: VideoClient, useValue: new VideoClient(http) },
    { provide: ImageAnalyticsClient, useValue: new ImageAnalyticsClient(http) },
    ListingCacheService,
    { provide: OUTBOUND_CLIENT, useExisting: OutboundClientService },
  ],
  exports: [OutboundClientService, OUTBOUND_CLIENT],
})
export class OutboundClientModule {}
