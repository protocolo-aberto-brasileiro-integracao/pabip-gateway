import { request } from '../http-client';
import { parseEntry, registerConfigCommands } from './config.commands';
import { buildTestProgram, run } from './test-program';

jest.mock('../http-client', () => ({
  ...jest.requireActual<typeof import('../http-client')>('../http-client'),
  request: jest.fn(),
}));

const requestMock = jest.mocked(request);

describe('config commands', () => {
  beforeEach(() => {
    requestMock.mockReset();
    jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('fetches the current config tree', async () => {
    requestMock.mockResolvedValue({ gateway: { devMode: false } });
    const program = buildTestProgram();
    registerConfigCommands(program);

    await run(program, ['--token', 'adm_test', 'config', 'get']);

    expect(requestMock).toHaveBeenCalledWith(expect.anything(), 'GET', '/admin/config');
  });

  it('sets one or more entries as a single PATCH with parsed values', async () => {
    requestMock.mockResolvedValue({ gateway: { devMode: false } });
    const program = buildTestProgram();
    registerConfigCommands(program);

    await run(program, [
      '--token',
      'adm_test',
      'config',
      'set',
      'delivery.maxAttempts=5',
      'output.type=callback',
    ]);

    expect(requestMock).toHaveBeenCalledWith(expect.anything(), 'PATCH', '/admin/config', {
      values: { 'delivery.maxAttempts': 5, 'output.type': 'callback' },
    });
  });
});

describe('parseEntry', () => {
  it('parses a numeric value as JSON', () => {
    expect(parseEntry('delivery.maxAttempts=5')).toEqual(['delivery.maxAttempts', 5]);
  });

  it('parses a boolean value as JSON', () => {
    expect(parseEntry('gateway.devMode=false')).toEqual(['gateway.devMode', false]);
  });

  it('parses a JSON object value', () => {
    expect(parseEntry('output.callback.headers={"x-api-key":"abc"}')).toEqual([
      'output.callback.headers',
      { 'x-api-key': 'abc' },
    ]);
  });

  it('falls back to a raw string when the value is not valid JSON', () => {
    expect(parseEntry('output.type=callback')).toEqual(['output.type', 'callback']);
  });

  it('keeps everything after the first "=" as the value', () => {
    expect(parseEntry('output.callback.url=https://example.com/hook?a=1&b=2')).toEqual([
      'output.callback.url',
      'https://example.com/hook?a=1&b=2',
    ]);
  });

  it('throws when there is no "=" separator', () => {
    expect(() => parseEntry('output.type')).toThrow(/Expected "key=value"/);
  });
});
