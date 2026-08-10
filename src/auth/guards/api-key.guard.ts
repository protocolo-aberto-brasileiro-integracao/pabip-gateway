import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PeerCacheService } from '../../peers/peer-cache.service';
import { hashSecret } from '../crypto.util';
import { SCOPES_KEY } from '../decorators/scopes.decorator';
import type { RequestWithPeer } from '../decorators/current-peer.decorator';
import { extractHeader } from '../http-header.util';

export const API_KEY_HEADER = 'x-api-key';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly peerCache: PeerCacheService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithPeer>();
    const rawKey = extractHeader(request, API_KEY_HEADER);
    if (!rawKey) {
      throw new UnauthorizedException(`Missing "${API_KEY_HEADER}" header.`);
    }

    const peer = this.peerCache.getByApiKeyHash(hashSecret(rawKey));
    if (!peer) {
      throw new UnauthorizedException('Invalid API key.');
    }

    const requiredScopes = this.reflector.getAllAndOverride<string[] | undefined>(SCOPES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (requiredScopes && requiredScopes.length > 0) {
      const missing = requiredScopes.filter((scope) => !peer.scopes.includes(scope));
      if (missing.length > 0) {
        throw new ForbiddenException(
          `Peer "${peer.name}" is missing required scope(s): ${missing.join(', ')}.`,
        );
      }
    }

    request.peer = peer;
    return true;
  }
}
