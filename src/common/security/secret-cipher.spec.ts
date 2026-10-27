import { randomBytes } from 'node:crypto';
import { decryptSecret, encryptSecret, parseKey } from './secret-cipher';

describe('encryptSecret/decryptSecret', () => {
  const key = randomBytes(32);

  it('round-trips a plaintext value', () => {
    const stored = encryptSecret('super-secret-value', key);
    expect(decryptSecret(stored, key)).toBe('super-secret-value');
  });

  it('produces a "v1:"-prefixed value that differs from the input', () => {
    const stored = encryptSecret('super-secret-value', key);
    expect(stored.startsWith('v1:')).toBe(true);
    expect(stored).not.toBe('super-secret-value');
  });

  it('produces a different ciphertext on each call thanks to a random IV', () => {
    const first = encryptSecret('super-secret-value', key);
    const second = encryptSecret('super-secret-value', key);
    expect(first).not.toBe(second);
  });

  it('throws when the stored ciphertext or auth tag has been tampered with', () => {
    const stored = encryptSecret('super-secret-value', key);
    const [, ivB64, tagB64, ctB64] = stored.split(/:|\|/);
    const tamperedCt = Buffer.from(ctB64, 'base64');
    tamperedCt[0] ^= 0xff;
    const tampered = `v1:${ivB64}|${tagB64}|${tamperedCt.toString('base64')}`;

    expect(() => decryptSecret(tampered, key)).toThrow();
  });

  it('returns legacy plaintext (no "v1:" prefix) unchanged', () => {
    expect(decryptSecret('their-key', key)).toBe('their-key');
  });
});

describe('parseKey', () => {
  it('accepts a 32-byte key encoded as base64', () => {
    const raw = randomBytes(32);
    expect(parseKey(raw.toString('base64'))).toEqual(raw);
  });

  it('accepts a 32-byte key encoded as hex', () => {
    const raw = randomBytes(32);
    expect(parseKey(raw.toString('hex'))).toEqual(raw);
  });

  it('rejects a key that does not decode to exactly 32 bytes', () => {
    expect(() => parseKey(randomBytes(16).toString('base64'))).toThrow(/32 bytes/);
  });
});
