import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ConfigFieldDefinition } from './config.constants';
import {
  getPath,
  loadConfigFile,
  readEnvValue,
  resetConfigFileCache,
  resolveAdminTokensSeed,
  resolveField,
  resolvePeerSeed,
  setPath,
} from './config-file.loader';

const ORIGINAL_ENV = { ...process.env };

function writeYamlFixture(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-config-'));
  const path = join(dir, 'gateway.config.yaml');
  writeFileSync(path, contents);
  return path;
}

describe('config-file.loader', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    resetConfigFileCache();
  });

  describe('getPath / setPath', () => {
    it('reads a nested dot-path', () => {
      expect(getPath({ output: { callback: { url: 'https://x' } } }, 'output.callback.url')).toBe(
        'https://x',
      );
    });

    it('returns undefined for a missing path', () => {
      expect(getPath({ output: {} }, 'output.callback.url')).toBeUndefined();
    });

    it('creates intermediate segments when writing', () => {
      const target: Record<string, unknown> = {};
      setPath(target, 'output.callback.url', 'https://x');
      expect(target).toEqual({ output: { callback: { url: 'https://x' } } });
    });

    it('overwrites a non-object segment instead of throwing', () => {
      const target: Record<string, unknown> = { output: 'not-an-object' };
      setPath(target, 'output.callback.url', 'https://x');
      expect(target).toEqual({ output: { callback: { url: 'https://x' } } });
    });
  });

  describe('loadConfigFile', () => {
    it('returns an empty object when the file does not exist', () => {
      process.env.GATEWAY_CONFIG_FILE = join(tmpdir(), 'does-not-exist-12345.yaml');
      expect(loadConfigFile()).toEqual({});
    });

    it('parses an existing YAML file', () => {
      process.env.GATEWAY_CONFIG_FILE = writeYamlFixture('gateway:\n  entePublicoName: acme\n');
      expect(loadConfigFile()).toEqual({ gateway: { entePublicoName: 'acme' } });
    });

    it('caches the parsed file across calls', () => {
      const path = writeYamlFixture('gateway:\n  entePublicoName: acme\n');
      process.env.GATEWAY_CONFIG_FILE = path;
      loadConfigFile();
      writeFileSync(path, 'gateway:\n  entePublicoName: changed\n');
      expect(loadConfigFile()).toEqual({ gateway: { entePublicoName: 'acme' } });
    });
  });

  describe('readEnvValue', () => {
    it('reads the plain ENV var when not sensitive', () => {
      process.env.SOME_VAR = 'plain';
      expect(readEnvValue('SOME_VAR', false)).toBe('plain');
    });

    it('prefers the _FILE variant when the field is sensitive and it is set', () => {
      const dir = mkdtempSync(join(tmpdir(), 'gateway-secret-'));
      const secretPath = join(dir, 'secret');
      writeFileSync(secretPath, 'from-file-secret\n');
      process.env.SOME_SECRET = 'from-env';
      process.env.SOME_SECRET_FILE = secretPath;

      expect(readEnvValue('SOME_SECRET', true)).toBe('from-file-secret');
    });

    it('falls back to the plain ENV var when sensitive but no _FILE variant is set', () => {
      process.env.SOME_SECRET = 'from-env';
      expect(readEnvValue('SOME_SECRET', true)).toBe('from-env');
    });
  });

  describe('resolveField', () => {
    const field: ConfigFieldDefinition = {
      key: 'logging.level',
      section: 'logging',
      envVar: 'LOG_LEVEL',
      type: 'string',
      bootOnly: false,
      default: 'info',
    };

    it('prefers ENV over file and default', () => {
      process.env.LOG_LEVEL = 'debug';
      process.env.GATEWAY_CONFIG_FILE = writeYamlFixture('logging:\n  level: warn\n');

      expect(resolveField(field)).toEqual({ value: 'debug', source: 'env' });
    });

    it('falls back to file when ENV is unset', () => {
      delete process.env.LOG_LEVEL;
      process.env.GATEWAY_CONFIG_FILE = writeYamlFixture('logging:\n  level: warn\n');

      expect(resolveField(field)).toEqual({ value: 'warn', source: 'file' });
    });

    it('falls back to default when neither ENV nor file has a value', () => {
      delete process.env.LOG_LEVEL;
      process.env.GATEWAY_CONFIG_FILE = join(tmpdir(), 'does-not-exist-12345.yaml');

      expect(resolveField(field)).toEqual({ value: 'info', source: 'default' });
    });

    it('returns undefined for a required field with no value anywhere', () => {
      delete process.env.DATABASE_URL;
      process.env.GATEWAY_CONFIG_FILE = join(tmpdir(), 'does-not-exist-12345.yaml');

      const required: ConfigFieldDefinition = {
        key: 'database.url',
        section: 'database',
        envVar: 'DATABASE_URL',
        type: 'string',
        bootOnly: true,
      };

      expect(resolveField(required)).toBeUndefined();
    });

    it('coerces a numeric ENV var', () => {
      process.env.DELIVERY_MAX_ATTEMPTS = '7';
      const numberField: ConfigFieldDefinition = {
        key: 'delivery.maxAttempts',
        section: 'delivery',
        envVar: 'DELIVERY_MAX_ATTEMPTS',
        type: 'number',
        bootOnly: false,
        default: 3,
      };

      expect(resolveField(numberField)).toEqual({ value: 7, source: 'env' });
    });

    it('coerces a boolean ENV var', () => {
      process.env.GATEWAY_DEV_MODE = 'true';
      const boolField: ConfigFieldDefinition = {
        key: 'gateway.devMode',
        section: 'gateway',
        envVar: 'GATEWAY_DEV_MODE',
        type: 'boolean',
        bootOnly: true,
        default: false,
      };

      expect(resolveField(boolField)).toEqual({ value: true, source: 'env' });
    });

    it('parses a JSON ENV var', () => {
      process.env.OUTPUT_CALLBACK_HEADERS = '{"Authorization":"Bearer x"}';
      const jsonField: ConfigFieldDefinition = {
        key: 'output.callback.headers',
        section: 'output',
        envVar: 'OUTPUT_CALLBACK_HEADERS',
        type: 'json',
        bootOnly: false,
        default: {},
      };

      expect(resolveField(jsonField)).toEqual({
        value: { Authorization: 'Bearer x' },
        source: 'env',
      });
    });

    it('throws when a numeric field cannot be coerced', () => {
      process.env.DELIVERY_MAX_ATTEMPTS = 'not-a-number';
      const numberField: ConfigFieldDefinition = {
        key: 'delivery.maxAttempts',
        section: 'delivery',
        envVar: 'DELIVERY_MAX_ATTEMPTS',
        type: 'number',
        bootOnly: false,
        default: 3,
      };

      expect(() => resolveField(numberField)).toThrow('Expected a number');
    });

    it('applies the _FILE convention for a sensitive field', () => {
      const dir = mkdtempSync(join(tmpdir(), 'gateway-secret-'));
      const secretPath = join(dir, 'secret');
      writeFileSync(secretPath, 'postgresql://user:pass@host/db\n');
      process.env.DATABASE_URL_FILE = secretPath;
      delete process.env.DATABASE_URL;

      const sensitiveField: ConfigFieldDefinition = {
        key: 'database.url',
        section: 'database',
        envVar: 'DATABASE_URL',
        type: 'string',
        bootOnly: true,
        sensitive: true,
      };

      expect(resolveField(sensitiveField)).toEqual({
        value: 'postgresql://user:pass@host/db',
        source: 'env',
      });
    });
  });

  describe('resolveAdminTokensSeed', () => {
    it('reads a comma-separated ENV var', () => {
      process.env.GATEWAY_ADMIN_TOKENS = 'token-a, token-b ,token-c';
      expect(resolveAdminTokensSeed()).toEqual(['token-a', 'token-b', 'token-c']);
    });

    it('falls back to the file array when ENV is unset', () => {
      delete process.env.GATEWAY_ADMIN_TOKENS;
      process.env.GATEWAY_CONFIG_FILE = writeYamlFixture(
        'gateway:\n  adminTokens:\n    - token-a\n    - token-b\n',
      );
      expect(resolveAdminTokensSeed()).toEqual(['token-a', 'token-b']);
    });

    it('returns an empty array when neither is set', () => {
      delete process.env.GATEWAY_ADMIN_TOKENS;
      process.env.GATEWAY_CONFIG_FILE = join(tmpdir(), 'does-not-exist-12345.yaml');
      expect(resolveAdminTokensSeed()).toEqual([]);
    });
  });

  describe('resolvePeerSeed', () => {
    it('reads the peer array from the file', () => {
      process.env.GATEWAY_CONFIG_FILE = writeYamlFixture(
        'peer:\n  - name: partner-a\n    baseUrl: https://a\n',
      );
      expect(resolvePeerSeed()).toEqual([{ name: 'partner-a', baseUrl: 'https://a' }]);
    });

    it('returns an empty array when the file has no peer key', () => {
      process.env.GATEWAY_CONFIG_FILE = writeYamlFixture('gateway:\n  entePublicoName: acme\n');
      expect(resolvePeerSeed()).toEqual([]);
    });
  });
});
