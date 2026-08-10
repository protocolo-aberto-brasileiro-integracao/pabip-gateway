import { redactSecrets, registerSecret, resetRegisteredSecrets } from './secret-redactor';

describe('secret-redactor', () => {
  afterEach(() => {
    resetRegisteredSecrets();
  });

  it('replaces every occurrence of a registered secret', () => {
    registerSecret('super-secret-token');

    const output = redactSecrets('auth failed with super-secret-token in header');

    expect(output).toBe('auth failed with [REDACTED] in header');
  });

  it('also redacts the password embedded in a connection-string-shaped secret', () => {
    registerSecret('postgresql://gateway:hunter2@db-host:5432/gateway');

    const output = redactSecrets('connect ECONNREFUSED, password was hunter2');

    expect(output).toBe('connect ECONNREFUSED, password was [REDACTED]');
  });

  it('leaves input untouched when nothing is registered', () => {
    expect(redactSecrets('nothing sensitive here')).toBe('nothing sensitive here');
  });

  it('ignores empty/undefined values passed to registerSecret', () => {
    registerSecret(undefined);
    registerSecret(null);
    registerSecret('');

    expect(redactSecrets('unchanged')).toBe('unchanged');
  });
});
