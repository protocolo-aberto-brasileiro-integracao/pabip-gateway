import type { IncomingMessage, ServerResponse } from 'node:http';
import { closeServerWithin, createPathGate } from './http-listener.util';

function buildResponse() {
  return {
    statusCode: 0,
    ended: false,
    end: jest.fn(function end(this: { ended: boolean }) {
      this.ended = true;
    }),
  };
}

describe('createPathGate', () => {
  it('forwards a request whose URL matches an allowed prefix exactly', () => {
    const handler = jest.fn();
    const gate = createPathGate(handler, ['/admin']);
    const req = { url: '/admin' } as IncomingMessage;
    const res = buildResponse();

    gate(req, res as unknown as ServerResponse);

    expect(handler).toHaveBeenCalledWith(req, res);
    expect(res.end).not.toHaveBeenCalled();
  });

  it('forwards a request whose URL is nested under an allowed prefix', () => {
    const handler = jest.fn();
    const gate = createPathGate(handler, ['/admin']);
    const req = { url: '/admin/peers/123' } as IncomingMessage;
    const res = buildResponse();

    gate(req, res as unknown as ServerResponse);

    expect(handler).toHaveBeenCalledWith(req, res);
  });

  it('forwards a request whose URL carries a query string on an allowed prefix', () => {
    const handler = jest.fn();
    const gate = createPathGate(handler, ['/image-analytics']);
    const req = { url: '/image-analytics?page=2' } as IncomingMessage;
    const res = buildResponse();

    gate(req, res as unknown as ServerResponse);

    expect(handler).toHaveBeenCalledWith(req, res);
  });

  it('rejects a request whose URL only shares a prefix textually, with a 404, never reaching the handler', () => {
    const handler = jest.fn();
    const gate = createPathGate(handler, ['/admin']);
    const req = { url: '/adminfoo' } as IncomingMessage;
    const res = buildResponse();

    gate(req, res as unknown as ServerResponse);

    expect(handler).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
    expect(res.end).toHaveBeenCalled();
  });

  it('rejects a request under a different surface entirely, with a 404', () => {
    const handler = jest.fn();
    const gate = createPathGate(handler, ['/image-analytics']);
    const req = { url: '/admin/peers' } as IncomingMessage;
    const res = buildResponse();

    gate(req, res as unknown as ServerResponse);

    expect(handler).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });

  it('rejects a request with no URL at all, without throwing', () => {
    const handler = jest.fn();
    const gate = createPathGate(handler, ['/admin']);
    const req = { url: undefined } as unknown as IncomingMessage;
    const res = buildResponse();

    gate(req, res as unknown as ServerResponse);

    expect(handler).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(404);
  });
});

describe('closeServerWithin', () => {
  it('resolves once the server reports closed', async () => {
    let closeCallback: (() => void) | undefined;
    const server = {
      close: jest.fn((cb: () => void) => {
        closeCallback = cb;
      }),
      closeIdleConnections: jest.fn(),
    };

    const closed = closeServerWithin(server as never, 5_000);
    closeCallback?.();

    await expect(closed).resolves.toBeUndefined();
    expect(server.closeIdleConnections).toHaveBeenCalled();
  });

  it('resolves after timeoutMs even if the server never reports closed', async () => {
    jest.useFakeTimers();
    const server = {
      close: jest.fn(),
      closeIdleConnections: jest.fn(),
    };

    const closed = closeServerWithin(server as never, 1_000);
    jest.advanceTimersByTime(1_000);

    await expect(closed).resolves.toBeUndefined();
    jest.useRealTimers();
  });
});
