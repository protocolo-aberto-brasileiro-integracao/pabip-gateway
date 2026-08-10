import { readFileSync } from 'node:fs';
import type { ClientConfig } from './http-client';

export const DEFAULT_ADMIN_URL = 'http://127.0.0.1:8081';

export interface GlobalOptions {
  adminUrl?: string;
  token?: string;
  tokenFile?: string;
}

export function resolveClientConfig(options: GlobalOptions): ClientConfig {
  return {
    baseUrl: resolveBaseUrl(options),
    token: requireToken(options),
  };
}

export function resolveBaseUrl(options: GlobalOptions): string {
  const raw = options.adminUrl ?? process.env.GATEWAY_ADMIN_URL ?? DEFAULT_ADMIN_URL;
  return raw.replace(/\/+$/, '');
}

function requireToken(options: GlobalOptions): string {
  const token = resolveToken(options);
  if (!token) {
    throw new Error(
      'Missing admin token — pass --token, --token-file, or set GATEWAY_ADMIN_TOKEN / GATEWAY_ADMIN_TOKEN_FILE.',
    );
  }
  return token;
}

function resolveToken(options: GlobalOptions): string | undefined {
  if (options.token) {
    return options.token;
  }
  if (options.tokenFile) {
    return readFileSync(options.tokenFile, 'utf8').trim();
  }
  if (process.env.GATEWAY_ADMIN_TOKEN) {
    return process.env.GATEWAY_ADMIN_TOKEN;
  }
  if (process.env.GATEWAY_ADMIN_TOKEN_FILE) {
    return readFileSync(process.env.GATEWAY_ADMIN_TOKEN_FILE, 'utf8').trim();
  }
  return undefined;
}
