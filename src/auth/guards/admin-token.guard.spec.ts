import { UnauthorizedException, type ExecutionContext } from '@nestjs/common';
import { AdminTokenGuard } from './admin-token.guard';

function buildContext(request: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('AdminTokenGuard', () => {
  let validate: jest.Mock;
  let guard: AdminTokenGuard;

  beforeEach(() => {
    validate = jest.fn();
    guard = new AdminTokenGuard({ validate } as never);
  });

  it('rejects a request with no X-Admin-Token header', async () => {
    const context = buildContext({ headers: {} });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
    expect(validate).not.toHaveBeenCalled();
  });

  it('rejects an invalid token', async () => {
    validate.mockResolvedValue(false);
    const context = buildContext({ headers: { 'x-admin-token': 'adm_bad' } });
    await expect(guard.canActivate(context)).rejects.toThrow(UnauthorizedException);
  });

  it('allows a valid token', async () => {
    validate.mockResolvedValue(true);
    const context = buildContext({ headers: { 'x-admin-token': 'adm_good' } });
    await expect(guard.canActivate(context)).resolves.toBe(true);
    expect(validate).toHaveBeenCalledWith('adm_good');
  });
});
