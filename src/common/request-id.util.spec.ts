import type { Request } from 'express';
import { resolveRequestId, resolveTrace, uuidv7 } from './request-id.util';

function buildRequest(headers: Record<string, string | string[]>): Request {
  return { headers } as unknown as Request;
}

describe('uuidv7', () => {
  it('produces a version-7 variant-10 UUID', () => {
    const value = uuidv7();
    expect(value).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('is time-ordered: a later id sorts after an earlier one', async () => {
    const first = uuidv7();
    await new Promise((resolve) => setTimeout(resolve, 2));
    const second = uuidv7();
    expect(second > first).toBe(true);
  });
});

describe('resolveRequestId', () => {
  it('keeps a well-formed inbound X-Request-Id', () => {
    expect(resolveRequestId(buildRequest({ 'x-request-id': 'abc.123:req-1' }))).toBe(
      'abc.123:req-1',
    );
  });

  it('generates a UUID v7 when the header is absent', () => {
    expect(resolveRequestId(buildRequest({}))).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('generates a UUID v7 when the header is malformed (bad chars or too long)', () => {
    expect(resolveRequestId(buildRequest({ 'x-request-id': 'has space' }))).toMatch(
      /^[0-9a-f-]{36}$/,
    );
    expect(resolveRequestId(buildRequest({ 'x-request-id': 'a'.repeat(129) }))).toMatch(
      /^[0-9a-f-]{36}$/,
    );
  });

  it('is idempotent: repeated calls on the same request return the same id', () => {
    const request = buildRequest({});
    const first = resolveRequestId(request);
    expect(resolveRequestId(request)).toBe(first);
  });

  it('takes the first value when the header arrives as an array', () => {
    expect(resolveRequestId(buildRequest({ 'x-request-id': ['req-a', 'req-b'] }))).toBe('req-a');
  });
});

describe('resolveTrace', () => {
  it('keeps well-formed actorId and caseRef identifiers', () => {
    const trace = resolveTrace(
      buildRequest({
        'x-request-id': 'req-1',
        'x-actor-id': 'user@example.com',
        'x-case-ref': 'PROC-2026/12345',
      }),
    );
    expect(trace).toEqual({
      requestId: 'req-1',
      actorId: 'user@example.com',
      caseRef: 'PROC-2026/12345',
    });
  });

  it('drops actorId and caseRef that break the charset or length bound', () => {
    const trace = resolveTrace(
      buildRequest({
        'x-request-id': 'req-1',
        'x-actor-id': 'spoofed\noperator',
        'x-case-ref': 'x'.repeat(129),
      }),
    );
    expect(trace.actorId).toBeUndefined();
    expect(trace.caseRef).toBeUndefined();
  });

  it('leaves actorId and caseRef undefined when their headers are absent', () => {
    const trace = resolveTrace(buildRequest({ 'x-request-id': 'req-1' }));
    expect(trace.actorId).toBeUndefined();
    expect(trace.caseRef).toBeUndefined();
  });
});
