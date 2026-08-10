import type { ExecutionContext } from '@nestjs/common';
import { resolveCurrentPeer, type RequestWithPeer } from './current-peer.decorator';

function buildContext(request: Partial<RequestWithPeer>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('resolveCurrentPeer', () => {
  it('returns the peer ApiKeyGuard already attached to the request', () => {
    const peer = { id: 'peer-1', name: 'acme' };
    const context = buildContext({ peer } as never);

    expect(resolveCurrentPeer(undefined, context)).toBe(peer);
  });

  it('throws a wiring error when no peer was resolved onto the request', () => {
    const context = buildContext({});
    expect(() => resolveCurrentPeer(undefined, context)).toThrow(/ApiKeyGuard/);
  });
});
