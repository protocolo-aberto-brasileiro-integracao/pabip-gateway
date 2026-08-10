import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import type { RequestWithPeer } from '../decorators/current-peer.decorator';
import { isIpAllowed, normalizeIp } from '../ip-match.util';

@Injectable()
export class IpAllowlistGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<RequestWithPeer>();
    const peer = request.peer;
    if (!peer) {
      throw new Error(
        'IpAllowlistGuard used on a route not protected by ApiKeyGuard — no peer was resolved onto the request.',
      );
    }

    const rawIp = request.ip ?? request.socket.remoteAddress ?? '';
    if (!isIpAllowed(rawIp, peer.ipAllowlist)) {
      throw new ForbiddenException(
        `Client IP "${normalizeIp(rawIp)}" is not allow-listed for peer "${peer.name}".`,
      );
    }
    return true;
  }
}
