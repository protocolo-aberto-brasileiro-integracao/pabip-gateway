import {
  ForbiddenException,
  HttpException,
  UnauthorizedException,
  type ExecutionContext,
} from '@nestjs/common';
import { PeersAccessGuard } from './peers-access.guard';

function buildContext(
  headers: Record<string, string>,
  request: Record<string, unknown> = {},
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ headers, ...request }),
      getResponse: () => ({ setHeader: jest.fn() }),
    }),
  } as unknown as ExecutionContext;
}

describe('PeersAccessGuard', () => {
  let adminValidate: jest.Mock;
  let clientResolve: jest.Mock;
  let consumePeersAccess: jest.Mock;
  let guard: PeersAccessGuard;

  beforeEach(() => {
    adminValidate = jest.fn();
    clientResolve = jest.fn();
    consumePeersAccess = jest.fn().mockResolvedValue({ allowed: true });
    guard = new PeersAccessGuard(
      { validate: adminValidate } as never,
      { resolve: clientResolve } as never,
      { consumePeersAccess } as never,
    );
  });

  it('rejects a request with neither header', async () => {
    const context = buildContext({});
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(adminValidate).not.toHaveBeenCalled();
    expect(clientResolve).not.toHaveBeenCalled();
  });

  it('allows a valid X-Admin-Token without ever checking the client token table, ip allowlist, or rate limit', async () => {
    adminValidate.mockResolvedValue(true);
    const context = buildContext({ 'x-admin-token': 'adm_good' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(adminValidate).toHaveBeenCalledWith('adm_good');
    expect(clientResolve).not.toHaveBeenCalled();
    expect(consumePeersAccess).not.toHaveBeenCalled();
  });

  it('falls through to the client token when the admin token is invalid', async () => {
    adminValidate.mockResolvedValue(false);
    clientResolve.mockResolvedValue({ id: 'clt-1', ipAllowlist: [] });
    const context = buildContext(
      { 'x-admin-token': 'adm_bad', 'x-client-token': 'clt_good' },
      { ip: '203.0.113.5' },
    );
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(clientResolve).toHaveBeenCalledWith('clt_good');
  });

  it('allows a valid X-Client-Token with no admin token present at all, consuming its own rate-limit bucket by token id', async () => {
    clientResolve.mockResolvedValue({ id: 'clt-1', ipAllowlist: [] });
    const context = buildContext({ 'x-client-token': 'clt_good' }, { ip: '203.0.113.5' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(adminValidate).not.toHaveBeenCalled();
    expect(consumePeersAccess).toHaveBeenCalledWith('clt-1');
  });

  it('rejects when both headers are present but invalid/unresolved', async () => {
    adminValidate.mockResolvedValue(false);
    clientResolve.mockResolvedValue(null);
    const context = buildContext({ 'x-admin-token': 'adm_bad', 'x-client-token': 'clt_bad' });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a resolved client token whose IP is outside its allowlist, without consuming the rate limit', async () => {
    clientResolve.mockResolvedValue({ id: 'clt-1', ipAllowlist: ['203.0.113.5'] });
    const context = buildContext({ 'x-client-token': 'clt_good' }, { ip: '198.51.100.9' });
    await expect(guard.canActivate(context)).rejects.toThrow(ForbiddenException);
    expect(consumePeersAccess).not.toHaveBeenCalled();
  });

  it('allows a resolved client token whose IP matches its allowlist', async () => {
    clientResolve.mockResolvedValue({ id: 'clt-1', ipAllowlist: ['203.0.113.0/24'] });
    const context = buildContext({ 'x-client-token': 'clt_good' }, { ip: '203.0.113.42' });
    await expect(guard.canActivate(context)).resolves.toBe(true);
  });

  it('rejects with 429 and a Retry-After header once the client token quota is exhausted', async () => {
    clientResolve.mockResolvedValue({ id: 'clt-1', ipAllowlist: [] });
    consumePeersAccess.mockResolvedValue({ allowed: false, retryAfterSeconds: 3 });
    const setHeader = jest.fn();
    const context = {
      switchToHttp: () => ({
        getRequest: () => ({ headers: { 'x-client-token': 'clt_good' }, ip: '203.0.113.5' }),
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext;

    await expect(guard.canActivate(context)).rejects.toThrow(HttpException);
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '3');
  });
});
