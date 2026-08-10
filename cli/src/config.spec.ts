import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DEFAULT_ADMIN_URL, resolveBaseUrl, resolveClientConfig } from './config';

describe('resolveBaseUrl', () => {
  const originalEnv = process.env.GATEWAY_ADMIN_URL;

  afterEach(() => {
    if (originalEnv === undefined) {
      delete process.env.GATEWAY_ADMIN_URL;
    } else {
      process.env.GATEWAY_ADMIN_URL = originalEnv;
    }
  });

  it('falls back to the built-in default', () => {
    delete process.env.GATEWAY_ADMIN_URL;
    expect(resolveBaseUrl({})).toBe(DEFAULT_ADMIN_URL);
  });

  it('prefers the --admin-url flag over the environment variable', () => {
    process.env.GATEWAY_ADMIN_URL = 'http://env.example:8081';
    expect(resolveBaseUrl({ adminUrl: 'http://flag.example:8081' })).toBe(
      'http://flag.example:8081',
    );
  });

  it('falls back to the environment variable when no flag is given', () => {
    process.env.GATEWAY_ADMIN_URL = 'http://env.example:8081';
    expect(resolveBaseUrl({})).toBe('http://env.example:8081');
  });

  it('strips a trailing slash so path concatenation never double-slashes', () => {
    expect(resolveBaseUrl({ adminUrl: 'http://flag.example:8081/' })).toBe(
      'http://flag.example:8081',
    );
  });
});

describe('resolveClientConfig', () => {
  let tempDir: string;
  const originalToken = process.env.GATEWAY_ADMIN_TOKEN;
  const originalTokenFile = process.env.GATEWAY_ADMIN_TOKEN_FILE;

  beforeEach(() => {
    tempDir = mkdtempSync(join(tmpdir(), 'pabip-gatewayctl-'));
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
    if (originalToken === undefined) {
      delete process.env.GATEWAY_ADMIN_TOKEN;
    } else {
      process.env.GATEWAY_ADMIN_TOKEN = originalToken;
    }
    if (originalTokenFile === undefined) {
      delete process.env.GATEWAY_ADMIN_TOKEN_FILE;
    } else {
      process.env.GATEWAY_ADMIN_TOKEN_FILE = originalTokenFile;
    }
  });

  it('throws when no token is available from any source', () => {
    delete process.env.GATEWAY_ADMIN_TOKEN;
    delete process.env.GATEWAY_ADMIN_TOKEN_FILE;
    expect(() => resolveClientConfig({})).toThrow(/Missing admin token/);
  });

  it('prefers --token over every other source', () => {
    process.env.GATEWAY_ADMIN_TOKEN = 'adm_env';
    const result = resolveClientConfig({ token: 'adm_flag' });
    expect(result.token).toBe('adm_flag');
  });

  it('reads --token-file when --token is absent', () => {
    const path = join(tempDir, 'token.txt');
    writeFileSync(path, 'adm_from_file\n');
    const result = resolveClientConfig({ tokenFile: path });
    expect(result.token).toBe('adm_from_file');
  });

  it('falls back to GATEWAY_ADMIN_TOKEN', () => {
    delete process.env.GATEWAY_ADMIN_TOKEN_FILE;
    process.env.GATEWAY_ADMIN_TOKEN = 'adm_env_var';
    expect(resolveClientConfig({}).token).toBe('adm_env_var');
  });

  it('falls back to GATEWAY_ADMIN_TOKEN_FILE last', () => {
    delete process.env.GATEWAY_ADMIN_TOKEN;
    const path = join(tempDir, 'token.txt');
    writeFileSync(path, 'adm_from_env_file');
    process.env.GATEWAY_ADMIN_TOKEN_FILE = path;
    expect(resolveClientConfig({}).token).toBe('adm_from_env_file');
  });
});
