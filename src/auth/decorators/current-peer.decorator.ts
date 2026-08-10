import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { CachedPeer } from '../../peers/peer-cache.service';

export type RequestWithPeer = Request & { peer?: CachedPeer };

export function resolveCurrentPeer(_data: unknown, ctx: ExecutionContext): CachedPeer {
  const request = ctx.switchToHttp().getRequest<RequestWithPeer>();
  if (!request.peer) {
    throw new Error(
      '@CurrentPeer() used on a route not protected by ApiKeyGuard — no peer was resolved onto the request.',
    );
  }
  return request.peer;
}

export const CurrentPeer = createParamDecorator(resolveCurrentPeer);
