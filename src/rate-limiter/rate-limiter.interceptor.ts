import {
  CallHandler,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { from, Observable } from 'rxjs';
import { switchMap } from 'rxjs/operators';
import { RateLimiterService } from './rate-limiter.service';

interface RequestWithResolvedPeerId extends Request {
  peer?: { id: string };
}

@Injectable()
export class RateLimiterInterceptor implements NestInterceptor {
  constructor(private readonly rateLimiter: RateLimiterService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest<RequestWithResolvedPeerId>();
    const peerId = request.peer?.id;

    if (!peerId) {
      throw new Error(
        'RateLimiterInterceptor used on a route with no peer resolved onto the request — apply ApiKeyGuard first.',
      );
    }

    return from(this.rateLimiter.consume(peerId, 'in')).pipe(
      switchMap((result) => {
        if (!result.allowed) {
          const response = context.switchToHttp().getResponse<Response>();
          response.setHeader('Retry-After', String(result.retryAfterSeconds ?? 1));
          throw new HttpException(
            'Rate limit exceeded for this peer.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        return next.handle();
      }),
    );
  }
}
