import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { registerSecret } from '../common/logging/secret-redactor';
import type { AdminTokenSeedWriter } from '../config/entity-seed.tokens';
import { generateOpaqueSecret, hashSecret } from './crypto.util';

export const ADMIN_TOKEN_PREFIX = 'adm_';

export interface IssuedAdminToken {
  id: string;
  token: string;
  label: string | null;
  createdAt: Date;
}

export interface AdminTokenSummary {
  id: string;
  label: string | null;
  createdAt: Date;
}

@Injectable()
export class AdminTokenService implements AdminTokenSeedWriter {
  private readonly logger = new Logger(AdminTokenService.name);

  constructor(private readonly prisma: PrismaService) {}

  async issue(label?: string): Promise<IssuedAdminToken> {
    const token = generateOpaqueSecret(ADMIN_TOKEN_PREFIX);
    registerSecret(token);
    const tokenHash = hashSecret(token);

    const row = await this.prisma.adminToken.create({
      data: { tokenHash, label: label ?? null },
    });

    return { id: row.id, token, label: row.label, createdAt: row.createdAt };
  }

  async list(): Promise<AdminTokenSummary[]> {
    const rows = await this.prisma.adminToken.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map((row) => ({ id: row.id, label: row.label, createdAt: row.createdAt }));
  }

  async revoke(id: string): Promise<void> {
    await this.prisma.adminToken.deleteMany({ where: { id } });
  }

  async validate(rawToken: string): Promise<boolean> {
    if (!rawToken) {
      return false;
    }
    const tokenHash = hashSecret(rawToken);
    const row = await this.prisma.adminToken.findUnique({ where: { tokenHash } });
    return row !== null;
  }

  async seedAdminTokens(tokens: string[]): Promise<void> {
    for (const rawToken of tokens) {
      registerSecret(rawToken);
      const tokenHash = hashSecret(rawToken);
      try {
        await this.prisma.adminToken.upsert({
          where: { tokenHash },
          create: { tokenHash, label: 'seed' },
          update: {},
        });
      } catch (error) {
        if (!(error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002')) {
          throw error;
        }
      }
    }

    const total = await this.prisma.adminToken.count();
    if (total === 0) {
      throw new Error(
        'No admin token is configured (gateway.adminTokens is empty) and none exist in the ' +
          'database yet — refusing to boot with an unprotected admin-api (fail-closed). Set ' +
          'gateway.adminTokens (config file) or GATEWAY_ADMIN_TOKENS (ENV, comma-separated) to ' +
          'at least one token before starting the gateway.',
      );
    }

    this.logger.log(`Seeded ${tokens.length} admin token(s); ${total} total on record.`);
  }
}
