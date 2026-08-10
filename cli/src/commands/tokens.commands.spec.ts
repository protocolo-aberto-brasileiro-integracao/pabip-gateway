import { request } from '../http-client';
import { registerTokensCommands } from './tokens.commands';
import { buildTestProgram, run } from './test-program';

jest.mock('../http-client', () => ({
  ...jest.requireActual<typeof import('../http-client')>('../http-client'),
  request: jest.fn(),
}));

const requestMock = jest.mocked(request);

describe('tokens commands', () => {
  let stdoutSpy: jest.SpyInstance;

  beforeEach(() => {
    requestMock.mockReset();
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('lists tokens with a pagination query string', async () => {
    requestMock.mockResolvedValue({ items: [], total: 0 });
    const program = buildTestProgram();
    registerTokensCommands(program);

    await run(program, [
      '--token',
      'adm_test',
      'tokens',
      'list',
      '--page',
      '1',
      '--page-size',
      '25',
    ]);

    expect(requestMock).toHaveBeenCalledWith(
      expect.anything(),
      'GET',
      '/admin/tokens?page=1&pageSize=25',
    );
  });

  it('issues a token with an optional label', async () => {
    requestMock.mockResolvedValue({ id: 'tok-1', token: 'adm_plain' });
    const program = buildTestProgram();
    registerTokensCommands(program);

    await run(program, ['--token', 'adm_test', 'tokens', 'issue', '--label', 'ci-runner']);

    expect(requestMock).toHaveBeenCalledWith(expect.anything(), 'POST', '/admin/tokens', {
      label: 'ci-runner',
    });
  });

  it('issues a token with no label at all', async () => {
    requestMock.mockResolvedValue({ id: 'tok-1', token: 'adm_plain' });
    const program = buildTestProgram();
    registerTokensCommands(program);

    await run(program, ['--token', 'adm_test', 'tokens', 'issue']);

    expect(requestMock).toHaveBeenCalledWith(expect.anything(), 'POST', '/admin/tokens', {
      label: undefined,
    });
  });

  it('revokes a token and prints a confirmation', async () => {
    requestMock.mockResolvedValue(undefined);
    const program = buildTestProgram();
    registerTokensCommands(program);

    await run(program, ['--token', 'adm_test', 'tokens', 'revoke', 'tok-1']);

    expect(requestMock).toHaveBeenCalledWith(expect.anything(), 'DELETE', '/admin/tokens/tok-1');
    expect(stdoutSpy).toHaveBeenCalledWith('Token tok-1 revoked.\n');
  });
});
