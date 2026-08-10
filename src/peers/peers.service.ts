import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { KeyIssuanceService } from '../auth/key-issuance.service';
import { ConfigService } from '../config/config.service';
import type { PeerSeedWriter } from '../config/entity-seed.tokens';
import { registerSecret } from '../common/logging/secret-redactor';
import { flattenValidationErrors } from '../common/validation.util';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreatePeerDto } from './dto/create-peer.dto';
import type { PeerResponseDto } from './dto/peer-response.dto';
import { OnboardingService } from './onboarding.service';
import { PeerCacheService, type CachedPeer } from './peer-cache.service';
import { PEERS_CHANGED_CHANNEL } from './peers.constants';

export interface PeerListResult {
  items: PeerResponseDto[];
  total: number;
  page: number;
  pageSize: number;
}

export interface RotatedPeerKey {
  id: string;
  issuedApiKey: string;
}

@Injectable()
export class PeersService implements PeerSeedWriter {
  private readonly logger = new Logger(PeersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly onboarding: OnboardingService,
    private readonly configService: ConfigService,
    private readonly peerCache: PeerCacheService,
    private readonly keyIssuance: KeyIssuanceService,
  ) {}

  async create(dto: CreatePeerDto): Promise<PeerResponseDto> {
    const { capabilities, issuedApiKey, apiKeyHash } = await this.onboarding.onboard({
      baseUrl: dto.baseUrl,
      theirApiKey: dto.theirApiKey,
      timeoutMs: this.configService.peerOnboarding.onboardingValidationTimeoutMs,
    });

    registerSecret(dto.theirApiKey);
    registerSecret(issuedApiKey);

    let row;
    try {
      row = await this.prisma.peer.create({
        data: {
          name: dto.name,
          baseUrl: dto.baseUrl,
          theirApiKey: dto.theirApiKey,
          apiKeyHash,
          scopes: dto.scopes,
          ipAllowlist: dto.ipAllowlist ?? [],
          capabilities,
        },
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new ConflictException(
          'A peer with this API key hash is already registered — likely a concurrent ' +
            'or repeated registration of the same peer.',
        );
      }
      throw error;
    }

    await this.notifyChanged();

    return { ...toResponseDto(row), issuedApiKey };
  }

  async findAll(page = 1, pageSize = 20): Promise<PeerListResult> {
    const safePage = Math.max(1, page);
    const safePageSize = Math.max(1, Math.min(pageSize, 200));

    const [rows, total] = await Promise.all([
      this.prisma.peer.findMany({
        orderBy: { createdAt: 'asc' },
        skip: (safePage - 1) * safePageSize,
        take: safePageSize,
      }),
      this.prisma.peer.count(),
    ]);

    return {
      items: rows.map(toResponseDto),
      total,
      page: safePage,
      pageSize: safePageSize,
    };
  }

  async findOne(id: string): Promise<PeerResponseDto> {
    const row = await this.prisma.peer.findUnique({ where: { id } });
    if (!row) {
      throw new NotFoundException(`Peer "${id}" not found.`);
    }
    return toResponseDto(row);
  }

  async update(
    id: string,
    patch: Partial<Pick<CreatePeerDto, 'name' | 'baseUrl' | 'scopes' | 'ipAllowlist'>>,
  ): Promise<PeerResponseDto> {
    try {
      const row = await this.prisma.peer.update({ where: { id }, data: patch });
      await this.notifyChanged();
      return toResponseDto(row);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`Peer "${id}" not found.`);
      }
      throw error;
    }
  }

  async remove(id: string): Promise<void> {
    try {
      await this.prisma.peer.delete({ where: { id } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`Peer "${id}" not found.`);
      }
      throw error;
    }
    await this.notifyChanged();
  }

  async rotateKey(id: string): Promise<RotatedPeerKey> {
    const { apiKey, apiKeyHash } = this.keyIssuance.issue();
    registerSecret(apiKey);

    try {
      await this.prisma.peer.update({ where: { id }, data: { apiKeyHash } });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2025') {
        throw new NotFoundException(`Peer "${id}" not found.`);
      }
      throw error;
    }

    await this.notifyChanged();
    return { id, issuedApiKey: apiKey };
  }

  resolve(peerId: string): CachedPeer | undefined {
    return this.peerCache.getById(peerId);
  }

  async seedPeers(peers: Record<string, unknown>[]): Promise<void> {
    for (const raw of peers) {
      const dto = plainToInstance(CreatePeerDto, raw);
      const errors = validateSync(dto);
      if (errors.length > 0) {
        const label = typeof raw.name === 'string' ? raw.name : 'unnamed';
        this.logger.error(
          `Skipping invalid peer seed entry ("${label}"): ${flattenValidationErrors(errors).join('; ')}`,
        );
        continue;
      }

      try {
        await this.create(dto);
      } catch (error) {
        if (error instanceof ConflictException) {
          this.logger.debug(`Peer "${dto.name}" is already registered — seed is a no-op.`);
          continue;
        }
        this.logger.error(
          `Failed to seed peer "${dto.name}": ${error instanceof Error ? error.message : String(error)}`,
        );
      }
    }
  }

  private async notifyChanged(): Promise<void> {
    await this.prisma.$executeRawUnsafe(`NOTIFY ${PEERS_CHANGED_CHANNEL}`);
  }
}

function toResponseDto(row: {
  id: string;
  name: string;
  baseUrl: string;
  scopes: string[];
  ipAllowlist: string[];
  capabilities: string[];
  createdAt: Date;
  updatedAt: Date;
}): PeerResponseDto {
  return {
    id: row.id,
    name: row.name,
    baseUrl: row.baseUrl,
    scopes: row.scopes,
    ipAllowlist: row.ipAllowlist,
    capabilities: row.capabilities,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
