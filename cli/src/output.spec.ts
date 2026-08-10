import { AdminApiError } from './http-client';
import { printError, printMessage, printResult } from './output';

describe('printResult', () => {
  let stdoutSpy: jest.SpyInstance;

  beforeEach(() => {
    stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
  });

  afterEach(() => {
    stdoutSpy.mockRestore();
  });

  it('prints pretty JSON for a defined value', () => {
    printResult({ id: 'peer-1' });
    expect(stdoutSpy).toHaveBeenCalledWith(`${JSON.stringify({ id: 'peer-1' }, null, 2)}\n`);
  });

  it('prints nothing for undefined (204 responses)', () => {
    printResult(undefined);
    expect(stdoutSpy).not.toHaveBeenCalled();
  });
});

describe('printMessage', () => {
  it('writes the message with a trailing newline', () => {
    const stdoutSpy = jest.spyOn(process.stdout, 'write').mockImplementation(() => true);
    printMessage('Peer peer-1 removed.');
    expect(stdoutSpy).toHaveBeenCalledWith('Peer peer-1 removed.\n');
    stdoutSpy.mockRestore();
  });
});

describe('printError', () => {
  let stderrSpy: jest.SpyInstance;
  const originalExitCode = process.exitCode;

  beforeEach(() => {
    stderrSpy = jest.spyOn(process.stderr, 'write').mockImplementation(() => true);
    process.exitCode = undefined;
  });

  afterEach(() => {
    stderrSpy.mockRestore();
    process.exitCode = originalExitCode;
  });

  it('prints an AdminApiError detail and every validation message, and sets a non-zero exit code', () => {
    const error = new AdminApiError(400, {
      type: 'about:blank',
      title: 'Bad Request',
      status: 400,
      detail: 'invalid payload',
      errors: ['name must not be empty', 'scopes must contain at least one item'],
    });

    printError(error);

    expect(stderrSpy).toHaveBeenCalledWith('admin-api error (400): invalid payload\n');
    expect(stderrSpy).toHaveBeenCalledWith('  - name must not be empty\n');
    expect(stderrSpy).toHaveBeenCalledWith('  - scopes must contain at least one item\n');
    expect(process.exitCode).toBe(1);
  });

  it('falls back to the title when an AdminApiError has no detail', () => {
    const error = new AdminApiError(404, { type: 'about:blank', title: 'Not Found', status: 404 });
    printError(error);
    expect(stderrSpy).toHaveBeenCalledWith('admin-api error (404): Not Found\n');
  });

  it('prints a plain Error message', () => {
    printError(new Error('Missing admin token.'));
    expect(stderrSpy).toHaveBeenCalledWith('Missing admin token.\n');
    expect(process.exitCode).toBe(1);
  });

  it('prints a fallback for a non-Error thrown value', () => {
    printError('plain string failure');
    expect(stderrSpy).toHaveBeenCalledWith('Unexpected error: plain string failure\n');
    expect(process.exitCode).toBe(1);
  });
});
