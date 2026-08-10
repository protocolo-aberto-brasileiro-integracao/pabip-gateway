import { ForbiddenException, type ExecutionContext } from '@nestjs/common';
import { IpAllowlistGuard } from './ip-allowlist.guard';

function buildContext(request: Record<string, unknown>): ExecutionContext {
  return { switchToHttp: () => ({ getRequest: () => request }) } as unknown as ExecutionContext;
}

describe('IpAllowlistGuard', () => {
  const guard = new IpAllowlistGuard();

  it('throws a wiring error when no peer was resolved onto the request', () => {
    const context = buildContext({ ip: '203.0.113.5' });
    expect(() => guard.canActivate(context)).toThrow(/ApiKeyGuard/);
  });

  it('allows any IP when the peer has no allowlist configured', () => {
    const context = buildContext({ ip: '203.0.113.5', peer: { name: 'acme', ipAllowlist: [] } });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('allows an exact IP match', () => {
    const context = buildContext({
      ip: '203.0.113.5',
      peer: { name: 'acme', ipAllowlist: ['203.0.113.5'] },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects an IP not in the allowlist', () => {
    const context = buildContext({
      ip: '198.51.100.9',
      peer: { name: 'acme', ipAllowlist: ['203.0.113.5'] },
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('allows an IP inside an allow-listed CIDR range', () => {
    const context = buildContext({
      ip: '203.0.113.42',
      peer: { name: 'acme', ipAllowlist: ['203.0.113.0/24'] },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects an IP outside an allow-listed CIDR range', () => {
    const context = buildContext({
      ip: '203.0.114.42',
      peer: { name: 'acme', ipAllowlist: ['203.0.113.0/24'] },
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('normalizes an IPv4-mapped IPv6 address before matching', () => {
    const context = buildContext({
      ip: '::ffff:203.0.113.5',
      peer: { name: 'acme', ipAllowlist: ['203.0.113.5'] },
    });
    expect(guard.canActivate(context)).toBe(true);
  });

  it('rejects when the client IP is not a well-formed IPv4 address', () => {
    const context = buildContext({
      ip: 'not-an-ip',
      peer: { name: 'acme', ipAllowlist: ['203.0.113.0/24'] },
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects when the allow-listed CIDR entry has a malformed range address', () => {
    const context = buildContext({
      ip: '203.0.113.5',
      peer: { name: 'acme', ipAllowlist: ['not-an-ip/24'] },
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('rejects when an octet in the client IP is out of range', () => {
    const context = buildContext({
      ip: '203.0.113.999',
      peer: { name: 'acme', ipAllowlist: ['203.0.113.0/24'] },
    });
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('falls back to the socket remote address when request.ip is absent', () => {
    const context = buildContext({
      socket: { remoteAddress: '203.0.113.5' },
      peer: { name: 'acme', ipAllowlist: ['203.0.113.5'] },
    });
    expect(guard.canActivate(context)).toBe(true);
  });
});
