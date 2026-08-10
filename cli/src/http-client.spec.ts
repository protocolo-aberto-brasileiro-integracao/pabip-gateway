import { AdminApiError, request } from './http-client';

type FakeResponse = Pick<Response, 'ok' | 'status' | 'statusText'> & {
  text: () => Promise<string>;
};

function stubFetch(response: FakeResponse): jest.MockedFunction<typeof fetch> {
  const mock = jest.fn().mockResolvedValue(response) as unknown as jest.MockedFunction<
    typeof fetch
  >;
  global.fetch = mock;
  return mock;
}

describe('request', () => {
  const config = { baseUrl: 'http://gateway.local:8081', token: 'adm_test' };

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('sends the admin token header and returns the parsed body on success', async () => {
    const fetchMock = stubFetch({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(JSON.stringify({ id: 'peer-1' })),
    });

    const result = await request(config, 'GET', '/admin/peers/peer-1');

    expect(result).toEqual({ id: 'peer-1' });
    expect(fetchMock).toHaveBeenCalledWith(
      'http://gateway.local:8081/admin/peers/peer-1',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({ 'X-Admin-Token': 'adm_test' }) as Record<
          string,
          unknown
        >,
      }),
    );
  });

  it('omits the admin token header when the token is empty', async () => {
    const fetchMock = stubFetch({
      ok: true,
      status: 200,
      statusText: 'OK',
      text: () => Promise.resolve(JSON.stringify({ status: 'ok' })),
    });

    await request({ baseUrl: config.baseUrl, token: '' }, 'GET', '/healthz');

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).not.toHaveProperty('X-Admin-Token');
  });

  it('sends a JSON body and content-type header when a body is given', async () => {
    const fetchMock = stubFetch({
      ok: true,
      status: 201,
      statusText: 'Created',
      text: () => Promise.resolve(''),
    });

    await request(config, 'POST', '/admin/peers', { name: 'partner' });

    const [, init] = fetchMock.mock.calls[0];
    expect(init?.body).toBe(JSON.stringify({ name: 'partner' }));
    expect(init?.headers).toMatchObject({ 'content-type': 'application/json' });
  });

  it('returns undefined for an empty 204 response body', async () => {
    stubFetch({
      ok: true,
      status: 204,
      statusText: 'No Content',
      text: () => Promise.resolve(''),
    });

    const result = await request(config, 'DELETE', '/admin/peers/peer-1');

    expect(result).toBeUndefined();
  });

  it('throws AdminApiError carrying the RFC 7807 body on a non-2xx response', async () => {
    const problem = {
      type: 'about:blank',
      title: 'Not Found',
      status: 404,
      detail: 'no such peer',
    };
    stubFetch({
      ok: false,
      status: 404,
      statusText: 'Not Found',
      text: () => Promise.resolve(JSON.stringify(problem)),
    });

    await expect(request(config, 'GET', '/admin/peers/missing')).rejects.toMatchObject({
      status: 404,
      problem,
    });
  });

  it('falls back to a synthetic problem body when the response is not problem+json', async () => {
    stubFetch({
      ok: false,
      status: 502,
      statusText: 'Bad Gateway',
      text: () => Promise.resolve('upstream timed out'),
    });

    const error: unknown = await request(config, 'GET', '/admin/peers').catch(
      (err: unknown) => err,
    );

    expect(error).toBeInstanceOf(AdminApiError);
    expect((error as AdminApiError).problem).toEqual({
      type: 'about:blank',
      title: 'Bad Gateway',
      status: 502,
      detail: 'upstream timed out',
    });
  });
});
