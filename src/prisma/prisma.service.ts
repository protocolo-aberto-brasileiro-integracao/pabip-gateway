import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';
import { registerSecret } from '../common/logging/secret-redactor';
import {
  assertDatabaseUrlAllowed,
  assertSchemaVersion,
  resolveDatabaseUrl,
  resolveDevMode,
} from './boot-guard';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);
  public readonly databaseUrl: string;

  constructor() {
    const databaseUrl = resolveDatabaseUrl();
    const devMode = resolveDevMode();
    assertDatabaseUrlAllowed(databaseUrl, devMode);

    registerSecret(databaseUrl);
    super({ adapter: new PrismaPg(databaseUrl) });
    this.databaseUrl = databaseUrl;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    await assertSchemaVersion(this);
    this.logger.log('Connected to the gateway registry database; schema version verified.');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
