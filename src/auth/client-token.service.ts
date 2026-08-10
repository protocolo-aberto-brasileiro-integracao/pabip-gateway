import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { registerSecret } from '../common/logging/secret-redactor';
import { generateOpaqueSecret, hashSecret } from './crypto.util';

export const CLIENT_TOKEN_PREFIX = 'clt_';

export interface IssuedClientToken {
  id: string;
  token: string;
  label: string | null;
  ipAllowlist: string[];
  createdAt: Date;
}

export interface ClientTokenSummary {
  id: string;
  label: string | null;
  ipAllowlist: string[];
  createdAt: Date;
}

export interface ResolvedClientToken {
  id: string;
  ipAllowlist: string[];
}

@Injectable()
export class ClientTokenService {
  constructor(private readonly prisma: PrismaService) {}

  async issue(label?: string, ipAllowlist?: string[]): Promise<IssuedClientToken> {
    const token = generateOpaqueSecret(CLIENT_TOKEN_PREFIX);
    registerSecret(token);
    const tokenHash = hashSecret(token);

    const row = await this.prisma.clientToken.create({
      data: { tokenHash, label: label ?? null, ipAllowlist: ipAllowlist ?? [] },
    });

    return {
      id: row.id,
      token,
      label: row.label,
      ipAllowlist: row.ipAllowlist,
      createdAt: row.createdAt,
    };
  }

  async list(): Promise<ClientTokenSummary[]> {
    const rows = await this.prisma.clientToken.findMany({ orderBy: { createdAt: 'asc' } });
    return rows.map((row) => ({
      id: row.id,
      label: row.label,
      ipAllowlist: row.ipAllowlist,
      createdAt: row.createdAt,
    }));
  }

  async revoke(id: string): Promise<void> {
    await this.prisma.clientToken.deleteMany({ where: { id } });
  }

  async resolve(rawToken: string): Promise<ResolvedClientToken | null> {
    if (!rawToken) {
      return null;
    }
    const tokenHash = hashSecret(rawToken);
    const row = await this.prisma.clientToken.findUnique({ where: { tokenHash } });
    return row ? { id: row.id, ipAllowlist: row.ipAllowlist } : null;
  }
}
