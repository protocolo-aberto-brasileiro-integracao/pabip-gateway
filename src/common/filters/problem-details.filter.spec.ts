import type { ArgumentsHost } from '@nestjs/common';
import { BadRequestException, HttpException, Logger, NotFoundException } from '@nestjs/common';
import { ProblemDetailsFilter, type ProblemDetails } from './problem-details.filter';

interface FakeResponse {
  status: jest.Mock<FakeResponse, [number]>;
  contentType: jest.Mock<FakeResponse, [string]>;
  send: jest.Mock<FakeResponse, [ProblemDetails]>;
  setHeader: jest.Mock<FakeResponse, [string, string]>;
}

function createResponse(): FakeResponse {
  const response = {} as FakeResponse;
  response.status = jest.fn<FakeResponse, [number]>().mockReturnValue(response);
  response.contentType = jest.fn<FakeResponse, [string]>().mockReturnValue(response);
  response.send = jest.fn<FakeResponse, [ProblemDetails]>().mockReturnValue(response);
  response.setHeader = jest.fn<FakeResponse, [string, string]>().mockReturnValue(response);
  return response;
}

function createHost(
  request: Record<string, unknown>,
  response: ReturnType<typeof createResponse>,
): ArgumentsHost {
  return {
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
    }),
  } as unknown as ArgumentsHost;
}

describe('ProblemDetailsFilter', () => {
  let filter: ProblemDetailsFilter;

  beforeEach(() => {
    filter = new ProblemDetailsFilter();
    jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('maps a NotFoundException to a 404 problem+json body', () => {
    const response = createResponse();
    const host = createHost({ method: 'GET', originalUrl: '/unknown' }, response);

    filter.catch(new NotFoundException('route not found'), host);

    expect(response.status).toHaveBeenCalledWith(404);
    expect(response.contentType).toHaveBeenCalledWith('application/problem+json');
    expect(response.send).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'https://protocolo-nacional.dev/problems/not-found',
        title: 'Not Found',
        status: 404,
        detail: 'route not found',
        instance: '/unknown',
      }),
    );
  });

  it('echoes an X-Request-Id response header, generating one when the request carries none', () => {
    const response = createResponse();
    const host = createHost({ method: 'GET', originalUrl: '/unknown', headers: {} }, response);

    filter.catch(new NotFoundException('route not found'), host);

    const [name, value] = response.setHeader.mock.calls[0];
    expect(name).toBe('X-Request-Id');
    expect(value).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('echoes back a well-formed inbound X-Request-Id unchanged', () => {
    const response = createResponse();
    const host = createHost(
      { method: 'GET', originalUrl: '/unknown', headers: { 'x-request-id': 'abc.123:req-1' } },
      response,
    );

    filter.catch(new NotFoundException('route not found'), host);

    expect(response.setHeader).toHaveBeenCalledWith('X-Request-Id', 'abc.123:req-1');
  });

  it('surfaces class-validator style violations as an "errors" extension, not a squashed detail', () => {
    const response = createResponse();
    const host = createHost({ method: 'POST', originalUrl: '/image-analytics/events' }, response);

    filter.catch(new BadRequestException(['field a is required', 'field b is invalid']), host);

    const body = response.send.mock.calls[0][0];
    expect(body.status).toBe(400);
    expect(body.errors).toEqual(['field a is required', 'field b is invalid']);
    expect(body.detail).toBeUndefined();
  });

  it('never leaks the message of a non-HttpException to the client', () => {
    const response = createResponse();
    const host = createHost({ method: 'GET', originalUrl: '/boom' }, response);

    filter.catch(new Error('leaked db password: hunter2'), host);

    expect(response.status).toHaveBeenCalledWith(500);
    const body = response.send.mock.calls[0][0];
    expect(body.detail).toBe('An unexpected error occurred.');
    expect(JSON.stringify(body)).not.toContain('hunter2');
  });

  it('maps an HttpException whose response is a plain string to `detail`', () => {
    const response = createResponse();
    const host = createHost({ method: 'GET', originalUrl: '/forbidden' }, response);

    filter.catch(new HttpException('you shall not pass', 403), host);

    expect(response.status).toHaveBeenCalledWith(403);
    const body = response.send.mock.calls[0][0];
    expect(body).toMatchObject({
      type: 'https://protocolo-nacional.dev/problems/forbidden',
      title: 'Forbidden',
      status: 403,
      detail: 'you shall not pass',
    });
  });

  it('falls back to a generic title for a status code with no HttpStatus label', () => {
    const response = createResponse();
    const host = createHost({ method: 'GET', originalUrl: '/teapot-ish' }, response);

    filter.catch(new HttpException('odd status', 499), host);

    const body = response.send.mock.calls[0][0];
    expect(body.status).toBe(499);
    expect(body.title).toBe('Error');
  });

  it('maps body-parser’s PayloadTooLargeError to a 413 problem+json body', () => {
    const response = createResponse();
    const host = createHost({ method: 'POST', originalUrl: '/image-analytics/events' }, response);
    const payloadTooLargeError = Object.assign(new Error('request entity too large'), {
      status: 413,
      type: 'entity.too.large',
      expose: true,
    });

    filter.catch(payloadTooLargeError, host);

    expect(response.status).toHaveBeenCalledWith(413);
    const body = response.send.mock.calls[0][0];
    expect(body).toMatchObject({
      type: 'https://protocolo-nacional.dev/problems/payload-too-large',
      title: 'Payload Too Large',
      status: 413,
      detail: 'request entity too large',
    });
  });

  it('recognizes a PayloadTooLargeError reported via statusCode instead of status', () => {
    const response = createResponse();
    const host = createHost({ method: 'POST', originalUrl: '/image-analytics/events' }, response);
    const payloadTooLargeError = Object.assign(new Error('request entity too large'), {
      statusCode: 413,
      type: 'entity.too.large',
    });

    filter.catch(payloadTooLargeError, host);

    expect(response.status).toHaveBeenCalledWith(413);
  });

  it('does not mistake an unrelated 413-shaped object for PayloadTooLargeError', () => {
    const response = createResponse();
    const host = createHost({ method: 'GET', originalUrl: '/boom' }, response);

    filter.catch({ status: 413, message: 'not the body-parser error' }, host);

    expect(response.status).toHaveBeenCalledWith(500);
  });

  it('falls back to the request url when originalUrl is absent', () => {
    const response = createResponse();
    const host = createHost({ method: 'GET', url: '/plain-url' }, response);

    filter.catch(new NotFoundException('route not found'), host);

    const body = response.send.mock.calls[0][0];
    expect(body.instance).toBe('/plain-url');
  });
});
