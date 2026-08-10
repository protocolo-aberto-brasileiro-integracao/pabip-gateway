import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { BatchScopeGuard } from './batch-scope.guard';

function buildContext(request: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('BatchScopeGuard', () => {
  const guard = new BatchScopeGuard();

  it('throws a wiring error when no peer was resolved onto the request', () => {
    const context = buildContext({ body: { batchType: 'plate' } });
    expect(() => guard.canActivate(context)).toThrow(/ApiKeyGuard/);
  });

  it('allows a peer with the matching scope for a plate batch', () => {
    const context = buildContext({
      body: { batchType: 'plate' },
      peer: { name: 'acme', scopes: ['plate:write'] },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows a peer with the matching scope for a face batch', () => {
    const context = buildContext({
      body: { batchType: 'face' },
      peer: { name: 'acme', scopes: ['face:write'] },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects a peer publishing a batchType it has no scope for', () => {
    const context = buildContext({
      body: { batchType: 'face' },
      peer: { name: 'acme', scopes: ['plate:write'] },
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('does not require both scopes when the peer only has one', () => {
    const context = buildContext({
      body: { batchType: 'plate' },
      peer: { name: 'acme', scopes: ['plate:write'] },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('lets a missing batchType fall through to DTO validation instead of guessing', () => {
    const context = buildContext({ body: {}, peer: { name: 'acme', scopes: [] } });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('lets an unrecognized batchType fall through to DTO validation instead of guessing', () => {
    const context = buildContext({
      body: { batchType: 'lpr-extended' },
      peer: { name: 'acme', scopes: [] },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('lets a missing body fall through to DTO validation instead of throwing', () => {
    const context = buildContext({ peer: { name: 'acme', scopes: [] } });
    expect(guard.canActivate(context)).toBe(true);
  });
});
