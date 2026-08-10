import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { BATCH_TYPES } from '@protocolo-aberto-brasileiro-integracao/pabip-sdk';
import type { RequestWithPeer } from '../../auth/decorators/current-peer.decorator';

@Injectable()
export class BatchScopeGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithPeer>();
    const peer = request.peer;
    if (!peer) {
      throw new Error(
        'BatchScopeGuard used on a route not protected by ApiKeyGuard — no peer was resolved onto the request.',
      );
    }

    const batchType = (request.body as Record<string, unknown> | undefined)?.batchType;
    if (
      typeof batchType !== 'string' ||
      !BATCH_TYPES.includes(batchType as (typeof BATCH_TYPES)[number])
    ) {
      return true;
    }

    const requiredScope = `${batchType}:write`;
    if (!peer.scopes.includes(requiredScope)) {
      throw new ForbiddenException(
        `Peer "${peer.name}" is missing required scope "${requiredScope}" for batchType "${batchType}".`,
      );
    }

    return true;
  }
}
