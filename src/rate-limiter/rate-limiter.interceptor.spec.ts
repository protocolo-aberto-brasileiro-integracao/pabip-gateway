import { HttpException, type CallHandler, type ExecutionContext } from '@nestjs/common';
import { of, firstValueFrom } from 'rxjs';
import { RateLimiterInterceptor } from './rate-limiter.interceptor';
import type { RateLimiterService } from './rate-limiter.service';

function buildContext(
  request: Record<string, unknown>,
  response: Record<string, unknown>,
): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ExecutionContext;
}

function buildHandler(value: unknown = { ok: true }): CallHandler {
  return { handle: () => of(value) };
}

describe('RateLimiterInterceptor', () => {
  let consume: jest.Mock;
  let interceptor: RateLimiterInterceptor;

  beforeEach(() => {
    consume = jest.fn();
    interceptor = new RateLimiterInterceptor({ consume } as unknown as RateLimiterService);
  });

  it('throws when used on a route with no peer resolved onto the request', () => {
    const context = buildContext({}, { setHeader: jest.fn() });

    expect(() => interceptor.intercept(context, buildHandler())).toThrow(/apply ApiKeyGuard first/);
  });

  it('consumes the inbound quota for the resolved peer and forwards the response when allowed', async () => {
    consume.mockResolvedValue({ allowed: true });
    const context = buildContext({ peer: { id: 'peer-1' } }, { setHeader: jest.fn() });

    const result = await firstValueFrom(interceptor.intercept(context, buildHandler({ ok: true })));

    expect(consume).toHaveBeenCalledWith('peer-1', 'in');
    expect(result).toEqual({ ok: true });
  });

  it('rejects with 429 and a Retry-After header when the quota is exhausted', async () => {
    consume.mockResolvedValue({ allowed: false, retryAfterSeconds: 3 });
    const setHeader = jest.fn();
    const context = buildContext({ peer: { id: 'peer-1' } }, { setHeader });

    await expect(firstValueFrom(interceptor.intercept(context, buildHandler()))).rejects.toThrow(
      HttpException,
    );
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '3');
  });

  it('falls back to a 1 second Retry-After when the service does not report one', async () => {
    consume.mockResolvedValue({ allowed: false });
    const setHeader = jest.fn();
    const context = buildContext({ peer: { id: 'peer-1' } }, { setHeader });

    await expect(firstValueFrom(interceptor.intercept(context, buildHandler()))).rejects.toThrow(
      HttpException,
    );
    expect(setHeader).toHaveBeenCalledWith('Retry-After', '1');
  });
});
