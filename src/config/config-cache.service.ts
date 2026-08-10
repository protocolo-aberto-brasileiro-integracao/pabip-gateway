import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { DbChangeNotifier } from '../common/db-change-notifier';
import { flattenValidationErrors } from '../common/validation.util';
import { PrismaService } from '../prisma/prisma.service';
import { CONFIG_CHANGED_CHANNEL, CONFIG_FIELDS, CONFIG_POLL_INTERVAL_MS } from './config.constants';
import { resolveField, setPath } from './config-file.loader';
import { GatewayConfigSchema } from './schema/gateway-config.schema';

@Injectable()
export class ConfigCacheService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ConfigCacheService.name);
  private schema?: GatewayConfigSchema;
  private notifier?: DbChangeNotifier;

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit(): Promise<void> {
    await this.reload();

    this.notifier = new DbChangeNotifier({
      channel: CONFIG_CHANGED_CHANNEL,
      connectionString: this.prisma.databaseUrl,
      pollIntervalMs: CONFIG_POLL_INTERVAL_MS,
      onChange: () => this.reload(),
      logger: this.logger,
    });
    await this.notifier.start();
  }

  async onModuleDestroy(): Promise<void> {
    await this.notifier?.stop();
  }

  getSchema(): GatewayConfigSchema {
    if (!this.schema) {
      throw new Error('ConfigCacheService.getSchema() called before the first reload completed.');
    }
    return this.schema;
  }

  async writeApiValue(key: string, value: unknown): Promise<void> {
    await this.prisma.gatewayConfig.upsert({
      where: { key },
      create: { key, value: value as never, source: 'api' },
      update: { value: value as never, source: 'api' },
    });
    await this.prisma.$executeRawUnsafe(`NOTIFY ${CONFIG_CHANGED_CHANNEL}`);
    await this.reload();
  }

  private async reload(): Promise<void> {
    const rows = await this.prisma.gatewayConfig.findMany();
    const byKey = new Map(rows.map((row) => [row.key, row]));

    const tree: Record<string, unknown> = {};
    for (const field of CONFIG_FIELDS) {
      const row = byKey.get(field.key);
      if (row) {
        setPath(tree, field.key, row.value);
        continue;
      }

      const resolved = resolveField(field);
      if (resolved) {
        setPath(tree, field.key, resolved.value);
      }
    }

    const instance = plainToInstance(GatewayConfigSchema, tree);
    const errors = validateSync(instance);
    if (errors.length > 0) {
      throw new Error(
        `Invalid gateway configuration after reconciliation: ${flattenValidationErrors(errors).join('; ')}`,
      );
    }

    this.schema = instance;
  }
}
