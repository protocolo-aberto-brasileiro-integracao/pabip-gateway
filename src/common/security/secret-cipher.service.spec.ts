import { randomBytes } from 'node:crypto';
import { Logger } from '@nestjs/common';
import { SecretCipherService } from './secret-cipher.service';

describe('SecretCipherService', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('when GATEWAY_SECRET_ENCRYPTION_KEY is set', () => {
    const key = randomBytes(32).toString('base64');
    const configService = { security: { secretEncryptionKey: key } };

    it('encrypts for storage and decrypts back to the original plaintext', () => {
      const service = new SecretCipherService(configService as never);

      const stored = service.encryptForStorage('their-key');
      expect(stored.startsWith('v1:')).toBe(true);
      expect(service.decryptFromStorage(stored)).toBe('their-key');
    });

    it('decrypts a legacy unencrypted row unchanged', () => {
      const service = new SecretCipherService(configService as never);
      expect(service.decryptFromStorage('their-key')).toBe('their-key');
    });

    it('does not warn', () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn');
      const service = new SecretCipherService(configService as never);

      service.encryptForStorage('their-key');

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  describe('when GATEWAY_SECRET_ENCRYPTION_KEY is unset', () => {
    const configService = { security: { secretEncryptionKey: undefined } };

    it('treats encryptForStorage/decryptFromStorage as identity functions', () => {
      const service = new SecretCipherService(configService as never);

      expect(service.encryptForStorage('their-key')).toBe('their-key');
      expect(service.decryptFromStorage('their-key')).toBe('their-key');
    });

    it('logs exactly one warning across repeated use', () => {
      const warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
      const service = new SecretCipherService(configService as never);

      service.encryptForStorage('their-key');
      service.decryptFromStorage('their-key');
      service.encryptForStorage('another-key');

      expect(warnSpy).toHaveBeenCalledTimes(1);
      expect(warnSpy.mock.calls[0][0]).toMatch(/unencrypted/);
    });
  });
});
