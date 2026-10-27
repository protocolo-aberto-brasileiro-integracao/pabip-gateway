import { randomBytes } from 'node:crypto';
import type { Request } from 'express';

export const REQUEST_ID_HEADER = 'X-Request-Id';
export const ACTOR_ID_HEADER = 'X-Actor-Id';
export const CASE_REF_HEADER = 'X-Case-Ref';

const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{1,128}$/;

export interface TraceContext {
  requestId: string;
  actorId?: string;
  caseRef?: string;
}

interface RequestWithTrace extends Request {
  requestId?: string;
}

export function uuidv7(): string {
  const bytes = randomBytes(16);
  const timestamp = Date.now();
  bytes[0] = Math.floor(timestamp / 2 ** 40) & 0xff;
  bytes[1] = Math.floor(timestamp / 2 ** 32) & 0xff;
  bytes[2] = Math.floor(timestamp / 2 ** 24) & 0xff;
  bytes[3] = Math.floor(timestamp / 2 ** 16) & 0xff;
  bytes[4] = Math.floor(timestamp / 2 ** 8) & 0xff;
  bytes[5] = timestamp & 0xff;
  bytes[6] = (bytes[6] & 0x0f) | 0x70;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function resolveRequestId(request: Request): string {
  const req = request as RequestWithTrace;
  if (req.requestId) {
    return req.requestId;
  }
  const raw = firstHeader(request, 'x-request-id');
  req.requestId = raw && REQUEST_ID_PATTERN.test(raw) ? raw : uuidv7();
  return req.requestId;
}

export function resolveTrace(request: Request): TraceContext {
  return {
    requestId: resolveRequestId(request),
    actorId: firstHeader(request, 'x-actor-id'),
    caseRef: firstHeader(request, 'x-case-ref'),
  };
}

function firstHeader(request: Request, name: string): string | undefined {
  const value = request.headers?.[name];
  return Array.isArray(value) ? value[0] : value;
}
