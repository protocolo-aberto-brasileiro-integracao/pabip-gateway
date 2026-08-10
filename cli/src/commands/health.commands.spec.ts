import { AdminApiError, request } from '../http-client';
import { registerHealthCommands } from './health.commands';
import { buildTestProgram, run } from './test-program';

jest.mock('../http-client', () => ({
  ...jest.requireActual<typeof import('../http-client')>('../http-client'),
  request: jest.fn(),
}));

const requestMock = jest.mocked(request);

describe('health check command', () => {
  let stdoutSpy: jest.SpyInstance;
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    requestMock.mockReset();
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    process.exitCode = undefined;
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
    process.exitCode = originalExitCode;
  });

  it('probes both /healthz and /readyz without an admin token and prints "ok" for both', async () => {
    requestMock.mockResolvedValue({ status: 'ok' });
    const program = buildTestProgram();
    registerHealthCommands(program);

    await run(program, ['--admin-url', 'http://gateway.local:8081', 'health', 'check']);

    expect(requestMock).toHaveBeenCalledWith(
      { baseUrl: 'http://gateway.local:8081', token: '' },
      'GET',
      '/healthz',
    );
    expect(requestMock).toHaveBeenCalledWith(
      { baseUrl: 'http://gateway.local:8081', token: '' },
      'GET',
      '/readyz',
    );
    expect(stdoutSpy).toHaveBeenCalledWith(
      `${JSON.stringify({ healthz: { status: 'ok' }, readyz: { status: 'ok' } }, null, 2)}\n`,
    );
    expect(process.exitCode).toBeUndefined();
  });

  it('reports an AdminApiError probe as unavailable with its detail, and sets a non-zero exit code', async () => {
    requestMock.mockImplementation((_config, _method, path: string) => {
      if (path === '/readyz') {
        return Promise.reject(
          new AdminApiError(503, {
            type: 'about:blank',
            title: 'Service Unavailable',
            status: 503,
            detail: 'database unreachable',
          }),
        );
      }
      return Promise.resolve({ status: 'ok' });
    });
    const program = buildTestProgram();
    registerHealthCommands(program);

    await run(program, ['--admin-url', 'http://gateway.local:8081', 'health', 'check']);

    expect(stdoutSpy).toHaveBeenCalledWith(
      `${JSON.stringify(
        {
          healthz: { status: 'ok' },
          readyz: { status: 'unavailable', detail: 'database unreachable' },
        },
        null,
        2,
      )}\n`,
    );
    expect(process.exitCode).toBe(1);
  });

  it('falls back to the AdminApiError title when it has no detail', async () => {
    requestMock.mockRejectedValue(
      new AdminApiError(503, { type: 'about:blank', title: 'Service Unavailable', status: 503 }),
    );
    const program = buildTestProgram();
    registerHealthCommands(program);

    await run(program, ['--admin-url', 'http://gateway.local:8081', 'health', 'check']);

    expect(stdoutSpy).toHaveBeenCalledWith(
      `${JSON.stringify(
        {
          healthz: { status: 'unavailable', detail: 'Service Unavailable' },
          readyz: { status: 'unavailable', detail: 'Service Unavailable' },
        },
        null,
        2,
      )}\n`,
    );
    expect(process.exitCode).toBe(1);
  });

  it('stringifies a non-Error thrown value as the probe detail', async () => {
    requestMock.mockRejectedValue('connection reset');
    const program = buildTestProgram();
    registerHealthCommands(program);

    await run(program, ['--admin-url', 'http://gateway.local:8081', 'health', 'check']);

    expect(stdoutSpy).toHaveBeenCalledWith(
      `${JSON.stringify(
        {
          healthz: { status: 'unavailable', detail: 'connection reset' },
          readyz: { status: 'unavailable', detail: 'connection reset' },
        },
        null,
        2,
      )}\n`,
    );
    expect(process.exitCode).toBe(1);
  });

  it('reports a network-level failure (connection refused) as unavailable with the error message', async () => {
    requestMock.mockRejectedValue(new Error('fetch failed'));
    const program = buildTestProgram();
    registerHealthCommands(program);

    await run(program, ['--admin-url', 'http://gateway.local:8081', 'health', 'check']);

    expect(stdoutSpy).toHaveBeenCalledWith(
      `${JSON.stringify(
        {
          healthz: { status: 'unavailable', detail: 'fetch failed' },
          readyz: { status: 'unavailable', detail: 'fetch failed' },
        },
        null,
        2,
      )}\n`,
    );
    expect(process.exitCode).toBe(1);
  });
});
