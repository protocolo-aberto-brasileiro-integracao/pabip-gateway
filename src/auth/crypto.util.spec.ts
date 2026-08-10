import { generateOpaqueSecret, hashSecret } from './crypto.util';

describe('crypto.util', () => {
  describe('generateOpaqueSecret', () => {
    it('prefixes the generated secret exactly as given', () => {
      const secret = generateOpaqueSecret('ak_live_');
      expect(secret.startsWith('ak_live_')).toBe(true);
    });

    it('generates a different value on every call', () => {
      const a = generateOpaqueSecret('adm_');
      const b = generateOpaqueSecret('adm_');
      expect(a).not.toBe(b);
    });
  });

  describe('hashSecret', () => {
    it('is deterministic for the same input', () => {
      expect(hashSecret('ak_live_abc')).toBe(hashSecret('ak_live_abc'));
    });

    it('produces different hashes for different inputs', () => {
      expect(hashSecret('ak_live_abc')).not.toBe(hashSecret('ak_live_def'));
    });

    it('never returns the raw input', () => {
      expect(hashSecret('ak_live_abc')).not.toBe('ak_live_abc');
    });
  });
});
