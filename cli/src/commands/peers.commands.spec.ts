import { request } from '../http-client';
import { registerPeersCommands } from './peers.commands';
import { buildTestProgram, run } from './test-program';

jest.mock('../http-client', () => ({
  ...jest.requireActual<typeof import('../http-client')>('../http-client'),
  request: jest.fn(),
}));

const requestMock = jest.mocked(request);

describe('peers commands', () => {
  let stdoutSpy: jest.SpyInstance;

  beforeEach(() => {
    requestMock.mockReset();
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('lists peers with a pagination query string', async () => {
    requestMock.mockResolvedValue({ items: [], total: 0 });
    const program = buildTestProgram();
    registerPeersCommands(program);

    await run(program, [
      '--token',
      'adm_test',
      'peers',
      'list',
      '--page',
      '2',
      '--page-size',
      '10',
    ]);

    expect(requestMock).toHaveBeenCalledWith(
      expect.objectContaining({ token: 'adm_test' }),
      'GET',
      '/admin/peers?page=2&pageSize=10',
    );
  });

  it('lists peers with no query string when no pagination flags are given', async () => {
    requestMock.mockResolvedValue({ items: [], total: 0 });
    const program = buildTestProgram();
    registerPeersCommands(program);

    await run(program, ['--token', 'adm_test', 'peers', 'list']);

    expect(requestMock).toHaveBeenCalledWith(expect.anything(), 'GET', '/admin/peers');
  });

  it('gets a single peer by id, url-encoding it', async () => {
    requestMock.mockResolvedValue({ id: 'peer/1' });
    const program = buildTestProgram();
    registerPeersCommands(program);

    await run(program, ['--token', 'adm_test', 'peers', 'get', 'peer/1']);

    expect(requestMock).toHaveBeenCalledWith(expect.anything(), 'GET', '/admin/peers/peer%2F1');
  });

  it('creates a peer, forwarding scopes and ip allowlist', async () => {
    requestMock.mockResolvedValue({ id: 'peer-1', apiKey: 'plain-key' });
    const program = buildTestProgram();
    registerPeersCommands(program);

    await run(program, [
      '--token',
      'adm_test',
      'peers',
      'create',
      '--name',
      'partner',
      '--base-url',
      'https://partner.example',
      '--their-api-key',
      'their-key',
      '--scope',
      'plate:write',
      'face:write',
      '--ip-allowlist',
      '10.0.0.1',
    ]);

    expect(requestMock).toHaveBeenCalledWith(expect.anything(), 'POST', '/admin/peers', {
      name: 'partner',
      baseUrl: 'https://partner.example',
      theirApiKey: 'their-key',
      scopes: ['plate:write', 'face:write'],
      ipAllowlist: ['10.0.0.1'],
    });
  });

  it('updates a peer, sending only the fields that were actually passed', async () => {
    requestMock.mockResolvedValue({ id: 'peer-1' });
    const program = buildTestProgram();
    registerPeersCommands(program);

    await run(program, ['--token', 'adm_test', 'peers', 'update', 'peer-1', '--name', 'renamed']);

    expect(requestMock).toHaveBeenCalledWith(expect.anything(), 'PATCH', '/admin/peers/peer-1', {
      name: 'renamed',
    });
  });

  it('updates every editable field at once when all flags are passed', async () => {
    requestMock.mockResolvedValue({ id: 'peer-1' });
    const program = buildTestProgram();
    registerPeersCommands(program);

    await run(program, [
      '--token',
      'adm_test',
      'peers',
      'update',
      'peer-1',
      '--name',
      'renamed',
      '--base-url',
      'https://renamed.example',
      '--scope',
      'face:write',
      '--ip-allowlist',
      '10.0.0.2',
      '10.0.0.3',
    ]);

    expect(requestMock).toHaveBeenCalledWith(expect.anything(), 'PATCH', '/admin/peers/peer-1', {
      name: 'renamed',
      baseUrl: 'https://renamed.example',
      scopes: ['face:write'],
      ipAllowlist: ['10.0.0.2', '10.0.0.3'],
    });
  });

  it('removes a peer and prints a confirmation instead of a JSON body', async () => {
    requestMock.mockResolvedValue(undefined);
    const program = buildTestProgram();
    registerPeersCommands(program);

    await run(program, ['--token', 'adm_test', 'peers', 'remove', 'peer-1']);

    expect(requestMock).toHaveBeenCalledWith(expect.anything(), 'DELETE', '/admin/peers/peer-1');
    expect(stdoutSpy).toHaveBeenCalledWith('Peer peer-1 removed.\n');
  });

  it('rotates a peer key', async () => {
    requestMock.mockResolvedValue({ apiKey: 'new-plain-key' });
    const program = buildTestProgram();
    registerPeersCommands(program);

    await run(program, ['--token', 'adm_test', 'peers', 'rotate-key', 'peer-1']);

    expect(requestMock).toHaveBeenCalledWith(
      expect.anything(),
      'POST',
      '/admin/peers/peer-1/rotate-key',
    );
  });
});
