import { Module } from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { SecretCipherService } from './secret-cipher.service';

@Module({
  imports: [ConfigModule],
  providers: [SecretCipherService],
  exports: [SecretCipherService],
})
export class SecretCipherModule {}
