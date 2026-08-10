import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AdminTokenService } from '../admin-token.service';
import { ClientTokenService } from '../client-token.service';
import { extractHeader } from '../http-header.util';
import { isIpAllowed, normalizeIp } from '../ip-match.util';
import { ADMIN_TOKEN_HEADER } from './admin-token.guard';
import { RateLimiterService } from '../../rate-limiter/rate-limiter.service';

export const CLIENT_TOKEN_HEADER = 'x-client-token';

@Injectable()
export class PeersAccessGuard implements CanActivate {
  constructor(
    private readonly adminTokens: AdminTokenService,
    private readonly clientTokens: ClientTokenService,
    private readonly rateLimiter: RateLimiterService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();

    const adminToken = extractHeader(request, ADMIN_TOKEN_HEADER);
    if (adminToken && (await this.adminTokens.validate(adminToken))) {
      return true;
    }

    const clientToken = extractHeader(request, CLIENT_TOKEN_HEADER);
    if (clientToken) {
      const resolved = await this.clientTokens.resolve(clientToken);
      if (resolved) {
        const rawIp = request.ip ?? request.socket.remoteAddress ?? '';
        if (!isIpAllowed(rawIp, resolved.ipAllowlist)) {
          throw new ForbiddenException(
            `Client IP "${normalizeIp(rawIp)}" is not allow-listed for this client token.`,
          );
        }

        const result = await this.rateLimiter.consumePeersAccess(resolved.id);
        if (!result.allowed) {
          const response = context.switchToHttp().getResponse<Response>();
          response.setHeader('Retry-After', String(result.retryAfterSeconds ?? 1));
          throw new HttpException(
            'Rate limit exceeded for this client token.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }

        return true;
      }
    }

    throw new UnauthorizedException(
      `Missing or invalid "${ADMIN_TOKEN_HEADER}"/"${CLIENT_TOKEN_HEADER}" header.`,
    );
  }
}
