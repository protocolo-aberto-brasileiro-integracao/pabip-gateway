import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { BootStatusService } from '../health/boot-status.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CONFIG_CHANGED_CHANNEL,
  CONFIG_FIELDS,
  GATEWAY_CONFIG_RESEED_ENV_VAR,
  type ConfigFieldDefinition,
} from './config.constants';
import { resolveField } from './config-file.loader';

@Injectable()
export class ConfigMigrationService implements OnApplicationBootstrap {
  private readonly logger = new Logger(ConfigMigrationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly bootStatus: BootStatusService,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const reseed = process.env[GATEWAY_CONFIG_RESEED_ENV_VAR] === 'true';
    if (reseed) {
      this.logger.warn(
        `${GATEWAY_CONFIG_RESEED_ENV_VAR}=true — apiWritable fields with source=api will be overridden ` +
          'by file/ENV this boot, then protected again on the next one.',
      );
    }

    for (const field of CONFIG_FIELDS) {
      if (field.bootOnly) {
        await this.reconcileBootOnly(field);
      } else {
        await this.reconcileApiWritable(field, reseed);
      }
    }

    await this.prisma.$executeRawUnsafe(`NOTIFY ${CONFIG_CHANGED_CHANNEL}`);

    this.bootStatus.markConfigMigrated();
    this.logger.log(`Reconciled ${CONFIG_FIELDS.length} config field(s) into "gateway_config".`);
  }

  private async reconcileBootOnly(field: ConfigFieldDefinition): Promise<void> {
    const resolved = resolveField(field);
    if (!resolved) {
      throw new Error(
        `Missing required boot-only config field "${field.key}" — set ${field.envVar} ` +
          '(or the corresponding config file entry).',
      );
    }

    await this.prisma.gatewayConfig.upsert({
      where: { key: field.key },
      create: { key: field.key, value: resolved.value as never, source: resolved.source },
      update: { value: resolved.value as never, source: resolved.source },
    });
  }

  private async reconcileApiWritable(field: ConfigFieldDefinition, reseed: boolean): Promise<void> {
    const resolved = resolveField(field);
    if (!resolved) {
      this.logger.warn(
        `Config field "${field.key}" has no file/ENV/default value — leaving it untouched.`,
      );
      return;
    }

    const valueJson = JSON.stringify(resolved.value);

    if (reseed) {
      await this.prisma.$executeRaw`
        INSERT INTO "gateway_config" ("key", "value", "source", "seededAt", "updatedAt")
        VALUES (${field.key}, ${valueJson}::jsonb, ${resolved.source}::"config_source", now(), now())
        ON CONFLICT ("key") DO UPDATE SET
          "value" = EXCLUDED."value",
          "source" = EXCLUDED."source",
          "updatedAt" = now()
      `;
    } else {
      await this.prisma.$executeRaw`
        INSERT INTO "gateway_config" ("key", "value", "source", "seededAt", "updatedAt")
        VALUES (${field.key}, ${valueJson}::jsonb, ${resolved.source}::"config_source", now(), now())
        ON CONFLICT ("key") DO UPDATE SET
          "value" = EXCLUDED."value",
          "source" = EXCLUDED."source",
          "updatedAt" = now()
        WHERE "gateway_config"."source" <> 'api'
      `;
    }
  }
}
