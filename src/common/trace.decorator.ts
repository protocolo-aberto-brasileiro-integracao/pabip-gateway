import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import { resolveTrace, type TraceContext } from './request-id.util';

export const Trace = createParamDecorator((_data: unknown, ctx: ExecutionContext): TraceContext => {
  return resolveTrace(ctx.switchToHttp().getRequest<Request>());
});
