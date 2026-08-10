import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AdminTokenService } from '../admin-token.service';
import { extractHeader } from '../http-header.util';

export const ADMIN_TOKEN_HEADER = 'x-admin-token';

@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(private readonly adminTokens: AdminTokenService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const rawToken = extractHeader(request, ADMIN_TOKEN_HEADER);
    if (!rawToken) {
      throw new UnauthorizedException(`Missing "${ADMIN_TOKEN_HEADER}" header.`);
    }

    const valid = await this.adminTokens.validate(rawToken);
    if (!valid) {
      throw new UnauthorizedException('Invalid admin token.');
    }
    return true;
  }
}
