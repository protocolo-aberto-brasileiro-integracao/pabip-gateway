import { request } from '../http-client';
import { registerClientTokensCommands } from './client-tokens.commands';
import { buildTestProgram, run } from './test-program';

jest.mock('../http-client', () => ({
  ...jest.requireActual<typeof import('../http-client')>('../http-client'),
  request: jest.fn(),
}));

const requestMock = jest.mocked(request);

describe('client-tokens commands', () => {
  let stdoutSpy: jest.SpyInstance;

  beforeEach(() => {
    requestMock.mockReset();
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('lists client tokens with a pagination query string', async () => {
    requestMock.mockResolvedValue({ items: [], total: 0 });
    const program = buildTestProgram();
    registerClientTokensCommands(program);

    await run(program, [
      '--token',
      'adm_test',
      'client-tokens',
      'list',
      '--page',
      '1',
      '--page-size',
      '25',
    ]);

    expect(requestMock).toHaveBeenCalledWith(
      expect.anything(),
      'GET',
      '/admin/client-tokens?page=1&pageSize=25',
    );
  });

  it('issues a client token with an optional label', async () => {
    requestMock.mockResolvedValue({ id: 'clt-1', token: 'clt_plain' });
    const program = buildTestProgram();
    registerClientTokensCommands(program);

    await run(program, [
      '--token',
      'adm_test',
      'client-tokens',
      'issue',
      '--label',
      'frontend-prod',
    ]);

    expect(requestMock).toHaveBeenCalledWith(expect.anything(), 'POST', '/admin/client-tokens', {
      label: 'frontend-prod',
      ipAllowlist: undefined,
    });
  });

  it('issues a client token with an ip allowlist', async () => {
    requestMock.mockResolvedValue({ id: 'clt-1', token: 'clt_plain' });
    const program = buildTestProgram();
    registerClientTokensCommands(program);

    await run(program, [
      '--token',
      'adm_test',
      'client-tokens',
      'issue',
      '--label',
      'frontend-prod',
      '--ip-allowlist',
      '203.0.113.5',
      '203.0.113.6',
    ]);

    expect(requestMock).toHaveBeenCalledWith(expect.anything(), 'POST', '/admin/client-tokens', {
      label: 'frontend-prod',
      ipAllowlist: ['203.0.113.5', '203.0.113.6'],
    });
  });

  it('issues a client token with no label or ip allowlist at all', async () => {
    requestMock.mockResolvedValue({ id: 'clt-1', token: 'clt_plain' });
    const program = buildTestProgram();
    registerClientTokensCommands(program);

    await run(program, ['--token', 'adm_test', 'client-tokens', 'issue']);

    expect(requestMock).toHaveBeenCalledWith(expect.anything(), 'POST', '/admin/client-tokens', {
      label: undefined,
      ipAllowlist: undefined,
    });
  });

  it('revokes a client token and prints a confirmation', async () => {
    requestMock.mockResolvedValue(undefined);
    const program = buildTestProgram();
    registerClientTokensCommands(program);

    await run(program, ['--token', 'adm_test', 'client-tokens', 'revoke', 'clt-1']);

    expect(requestMock).toHaveBeenCalledWith(
      expect.anything(),
      'DELETE',
      '/admin/client-tokens/clt-1',
    );
    expect(stdoutSpy).toHaveBeenCalledWith('Client token clt-1 revoked.\n');
  });
});
