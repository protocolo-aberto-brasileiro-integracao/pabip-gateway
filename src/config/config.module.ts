import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module';
import { ConfigCacheService } from './config-cache.service';
import { ConfigMigrationService } from './config-migration.service';
import { ConfigService } from './config.service';
import { EntitySeedService } from './entity-seed.service';

@Module({
  imports: [PrismaModule],
  providers: [ConfigService, ConfigCacheService, ConfigMigrationService, EntitySeedService],
  exports: [ConfigService],
})
export class ConfigModule {}
