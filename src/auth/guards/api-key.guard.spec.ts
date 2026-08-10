import { ForbiddenException, UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import type { Reflector } from '@nestjs/core';
import { hashSecret } from '../crypto.util';
import { ApiKeyGuard } from './api-key.guard';

function buildContext(request: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({ getRequest: () => request }),
    getHandler: () => jest.fn(),
    getClass: () => jest.fn(),
  } as unknown as ExecutionContext;
}

describe('ApiKeyGuard', () => {
  let getByApiKeyHash: jest.Mock;
  let getAllAndOverride: jest.Mock;
  let guard: ApiKeyGuard;

  beforeEach(() => {
    getByApiKeyHash = jest.fn();
    getAllAndOverride = jest.fn().mockReturnValue(undefined);
    guard = new ApiKeyGuard(
      { getByApiKeyHash } as never,
      { getAllAndOverride } as unknown as Reflector,
    );
  });

  it('rejects a request with no X-API-Key header', () => {
    const context = buildContext({ headers: {} });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('rejects a key that does not resolve to any peer', () => {
    getByApiKeyHash.mockReturnValue(undefined);
    const context = buildContext({ headers: { 'x-api-key': 'ak_live_unknown' } });
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('attaches the resolved peer to the request on a valid key', () => {
    const peer = { id: 'peer-1', name: 'acme', scopes: ['plate:write'] };
    getByApiKeyHash.mockReturnValue(peer);
    const request: Record<string, unknown> = { headers: { 'x-api-key': 'ak_live_valid' } };

    const result = guard.canActivate(buildContext(request));

    expect(result).toBe(true);
    expect(request.peer).toBe(peer);
    expect(getByApiKeyHash).toHaveBeenCalledWith(hashSecret('ak_live_valid'));
  });

  it('rejects when the peer lacks a required scope', () => {
    getByApiKeyHash.mockReturnValue({ id: 'peer-1', name: 'acme', scopes: ['plate:write'] });
    getAllAndOverride.mockReturnValue(['face:write']);
    const context = buildContext({ headers: { 'x-api-key': 'ak_live_valid' } });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows when the peer has every required scope', () => {
    getByApiKeyHash.mockReturnValue({
      id: 'peer-1',
      name: 'acme',
      scopes: ['plate:write', 'face:write'],
    });
    getAllAndOverride.mockReturnValue(['plate:write']);
    const context = buildContext({ headers: { 'x-api-key': 'ak_live_valid' } });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('takes the first value when the header is duplicated', () => {
    const peer = { id: 'peer-1', name: 'acme', scopes: [] };
    getByApiKeyHash.mockReturnValue(peer);
    const context = buildContext({ headers: { 'x-api-key': ['ak_live_a', 'ak_live_b'] } });

    guard.canActivate(context);

    expect(getByApiKeyHash).toHaveBeenCalledWith(hashSecret('ak_live_a'));
  });
});
