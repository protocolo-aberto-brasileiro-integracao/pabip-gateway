import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { load } from 'js-yaml';
import type { ConfigFieldDefinition, ConfigFieldType } from './config.constants';

const DEFAULT_CONFIG_FILE_PATH = 'gateway.config.yaml';

let cachedFile: Record<string, unknown> | undefined;

export function loadConfigFile(): Record<string, unknown> {
  if (cachedFile) {
    return cachedFile;
  }

  const path = process.env.GATEWAY_CONFIG_FILE ?? DEFAULT_CONFIG_FILE_PATH;
  const absolutePath = resolve(process.cwd(), path);

  if (!existsSync(absolutePath)) {
    cachedFile = {};
    return cachedFile;
  }

  const raw = readFileSync(absolutePath, 'utf8');
  const parsed: unknown = load(raw);
  cachedFile = parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {};
  return cachedFile;
}

export function resetConfigFileCache(): void {
  cachedFile = undefined;
}

export function getPath(source: Record<string, unknown>, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, segment) => {
    if (acc !== null && typeof acc === 'object' && segment in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[segment];
    }
    return undefined;
  }, source);
}

export function setPath(target: Record<string, unknown>, path: string, value: unknown): void {
  const segments = path.split('.');
  let cursor = target;
  for (let i = 0; i < segments.length - 1; i++) {
    const segment = segments[i];
    const existing = cursor[segment];
    if (existing === null || typeof existing !== 'object') {
      cursor[segment] = {};
    }
    cursor = cursor[segment] as Record<string, unknown>;
  }
  cursor[segments[segments.length - 1]] = value;
}

export function readEnvValue(envVar: string, sensitive: boolean): string | undefined {
  if (sensitive) {
    const filePath = process.env[`${envVar}_FILE`];
    if (filePath) {
      return readFileSync(filePath, 'utf8').trim();
    }
  }
  return process.env[envVar];
}

function coerce(raw: unknown, type: ConfigFieldType): unknown {
  switch (type) {
    case 'string':
      return typeof raw === 'string' ? raw : String(raw);
    case 'number': {
      const num = typeof raw === 'number' ? raw : Number(raw);
      if (Number.isNaN(num)) {
        throw new Error(`Expected a number, got ${JSON.stringify(raw)}`);
      }
      return num;
    }
    case 'boolean':
      if (typeof raw === 'boolean') {
        return raw;
      }
      return raw === 'true' || raw === '1';
    case 'json':
      return typeof raw === 'string' ? JSON.parse(raw) : raw;
  }
}

export interface ResolvedConfigValue {
  value: unknown;
  source: 'env' | 'file' | 'default';
}

export function resolveField(field: ConfigFieldDefinition): ResolvedConfigValue | undefined {
  const envRaw = readEnvValue(field.envVar, field.sensitive ?? false);
  if (envRaw !== undefined) {
    return { value: coerce(envRaw, field.type), source: 'env' };
  }

  const fileRaw = getPath(loadConfigFile(), field.key);
  if (fileRaw !== undefined) {
    return { value: coerce(fileRaw, field.type), source: 'file' };
  }

  if (field.default !== undefined) {
    return { value: field.default, source: 'default' };
  }

  return undefined;
}

export function resolveAdminTokensSeed(): string[] {
  const envValue = process.env.GATEWAY_ADMIN_TOKENS;
  if (envValue !== undefined) {
    return envValue
      .split(',')
      .map((token) => token.trim())
      .filter((token) => token.length > 0);
  }

  const fileValue = getPath(loadConfigFile(), 'gateway.adminTokens');
  if (Array.isArray(fileValue)) {
    return fileValue.filter((entry): entry is string => typeof entry === 'string');
  }

  return [];
}

export function resolvePeerSeed(): Record<string, unknown>[] {
  const fileValue = getPath(loadConfigFile(), 'peer');
  if (!Array.isArray(fileValue)) {
    return [];
  }
  return fileValue.filter(
    (entry): entry is Record<string, unknown> => entry !== null && typeof entry === 'object',
  );
}
