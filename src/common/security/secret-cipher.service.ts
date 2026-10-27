import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';
import { decryptSecret, encryptSecret, parseKey } from './secret-cipher';

@Injectable()
export class SecretCipherService {
  private readonly logger = new Logger(SecretCipherService.name);
  private key?: Buffer;
  private keyResolved = false;

  constructor(private readonly configService: ConfigService) {}

  encryptForStorage(plaintext: string): string {
    const key = this.resolveKey();
    return key ? encryptSecret(plaintext, key) : plaintext;
  }

  decryptFromStorage(stored: string): string {
    const key = this.resolveKey();
    return key ? decryptSecret(stored, key) : stored;
  }

  private resolveKey(): Buffer | undefined {
    // Read lazily instead of in the constructor: ConfigService's underlying
    // schema isn't populated yet while Nest is still instantiating providers.
    if (this.keyResolved) {
      return this.key;
    }
    this.keyResolved = true;

    const raw = this.configService.security.secretEncryptionKey;
    if (!raw) {
      this.logger.warn(
        'GATEWAY_SECRET_ENCRYPTION_KEY is not set — peer upstream API keys are stored unencrypted at rest.',
      );
      return undefined;
    }

    this.key = parseKey(raw);
    return this.key;
  }
}
