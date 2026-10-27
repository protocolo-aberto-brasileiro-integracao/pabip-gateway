import { Module } from '@nestjs/common';
import { ConfigModule } from '../../config/config.module';
import { EgressPolicyService } from './egress-policy';

@Module({
  imports: [ConfigModule],
  providers: [EgressPolicyService],
  exports: [EgressPolicyService],
})
export class EgressPolicyModule {}
