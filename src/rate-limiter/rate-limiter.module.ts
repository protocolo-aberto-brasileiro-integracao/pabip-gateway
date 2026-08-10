import { Module } from '@nestjs/common';
import { RateLimiterInterceptor } from './rate-limiter.interceptor';
import { RateLimiterService } from './rate-limiter.service';

@Module({
  providers: [RateLimiterService, RateLimiterInterceptor],
  exports: [RateLimiterService, RateLimiterInterceptor],
})
export class RateLimiterModule {}
