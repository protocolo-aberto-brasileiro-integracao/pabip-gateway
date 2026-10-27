import type { NextFunction, Request, Response } from 'express';
import { RequestIdMiddleware } from './request-id.middleware';

describe('RequestIdMiddleware', () => {
  it('echoes the resolved request id as the X-Request-Id response header and continues', () => {
    const middleware = new RequestIdMiddleware();
    const req = { headers: { 'x-request-id': 'req-1' } } as unknown as Request;
    const setHeader = jest.fn();
    const res = { setHeader } as unknown as Response;
    const next = jest.fn() as unknown as NextFunction;

    middleware.use(req, res, next);

    expect(setHeader).toHaveBeenCalledWith('X-Request-Id', 'req-1');
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('generates and echoes a UUID v7 when the inbound header is absent', () => {
    const middleware = new RequestIdMiddleware();
    const req = { headers: {} } as unknown as Request;
    const setHeader = jest.fn();
    const res = { setHeader } as unknown as Response;
    const next = jest.fn() as unknown as NextFunction;

    middleware.use(req, res, next);

    const [name, value] = setHeader.mock.calls[0] as [string, string];
    expect(name).toBe('X-Request-Id');
    expect(value).toMatch(/^[0-9a-f-]{36}$/);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
