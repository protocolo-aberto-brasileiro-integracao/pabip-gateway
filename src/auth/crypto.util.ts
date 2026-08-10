import { createHash, randomBytes } from 'node:crypto';

export function generateOpaqueSecret(prefix: string): string {
  return `${prefix}${randomBytes(32).toString('base64url')}`;
}

export function hashSecret(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}
