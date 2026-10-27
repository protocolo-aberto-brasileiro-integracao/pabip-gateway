import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12;
const KEY_LENGTH_BYTES = 32;
const VERSION_PREFIX = 'v1:';
const HEX_32_BYTES = /^[0-9a-fA-F]{64}$/;

export function encryptSecret(plaintext: string, key: Buffer): string {
  const iv = randomBytes(IV_LENGTH_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${VERSION_PREFIX}${iv.toString('base64')}|${tag.toString('base64')}|${ciphertext.toString('base64')}`;
}

export function decryptSecret(stored: string, key: Buffer): string {
  if (!stored.startsWith(VERSION_PREFIX)) {
    // Legacy rows (and integration-spec fixtures) write theirApiKey as raw
    // plaintext; passing them through keeps those readable without a migration.
    return stored;
  }

  const [ivRaw, tagRaw, ciphertextRaw] = stored.slice(VERSION_PREFIX.length).split('|');
  if (!ivRaw || !tagRaw || !ciphertextRaw) {
    throw new Error('Malformed encrypted secret: expected "v1:<iv>|<tag>|<ciphertext>".');
  }

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivRaw, 'base64'));
  decipher.setAuthTag(Buffer.from(tagRaw, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ciphertextRaw, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}

export function parseKey(raw: string): Buffer {
  const key = HEX_32_BYTES.test(raw) ? Buffer.from(raw, 'hex') : Buffer.from(raw, 'base64');

  if (key.length !== KEY_LENGTH_BYTES) {
    throw new Error(
      `Secret encryption key must decode to exactly ${KEY_LENGTH_BYTES} bytes (got ${key.length}); ` +
        'generate one with "openssl rand -base64 32".',
    );
  }

  return key;
}
