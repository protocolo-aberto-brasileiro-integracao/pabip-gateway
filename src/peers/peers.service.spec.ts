import { ConflictException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PeerUnreachableError } from './peer-onboarding.error';
import { PeersService } from './peers.service';

function knownRequestError(code: string): Prisma.PrismaClientKnownRequestError {
  return new Prisma.PrismaClientKnownRequestError('simulated', { code, clientVersion: 'test' });
}

describe('PeersService', () => {
  let create: jest.Mock;
  let findMany: jest.Mock;
  let findUnique: jest.Mock;
  let update: jest.Mock;
  let del: jest.Mock;
  let count: jest.Mock;
  let executeRawUnsafe: jest.Mock;
  let prisma: {
    peer: {
      create: jest.Mock;
      findMany: jest.Mock;
      findUnique: jest.Mock;
      update: jest.Mock;
      delete: jest.Mock;
      count: jest.Mock;
    };
    $executeRawUnsafe: jest.Mock;
  };
  let onboard: jest.Mock;
  let getById: jest.Mock;
  let issueKey: jest.Mock;
  let configService: { peerOnboarding: { onboardingValidationTimeoutMs: number } };
  let service: PeersService;

  const dto = {
    name: 'acme',
    baseUrl: 'https://acme.example',
    theirApiKey: 'their-key',
    scopes: ['plate:write'],
    ipAllowlist: undefined,
  };

  const row = {
    id: 'peer-1',
    name: 'acme',
    baseUrl: 'https://acme.example',
    theirApiKey: 'their-key',
    apiKeyHash: 'hash-1',
    scopes: ['plate:write'],
    ipAllowlist: [],
    capabilities: ['plate'],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    create = jest.fn().mockResolvedValue(row);
    findMany = jest.fn().mockResolvedValue([row]);
    findUnique = jest.fn().mockResolvedValue(row);
    update = jest.fn().mockResolvedValue(row);
    del = jest.fn().mockResolvedValue(row);
    count = jest.fn().mockResolvedValue(1);
    executeRawUnsafe = jest.fn().mockResolvedValue(0);
    prisma = {
      peer: { create, findMany, findUnique, update, delete: del, count },
      $executeRawUnsafe: executeRawUnsafe,
    };
    onboard = jest.fn().mockResolvedValue({
      capabilities: ['plate'],
      issuedApiKey: 'ak_live_new',
      apiKeyHash: 'hash-1',
    });
    getById = jest.fn();
    issueKey = jest.fn().mockReturnValue({ apiKey: 'ak_live_rotated', apiKeyHash: 'hash-rotated' });
    configService = { peerOnboarding: { onboardingValidationTimeoutMs: 5_000 } };
    service = new PeersService(
      prisma as never,
      { onboard } as never,
      configService as never,
      { getById } as never,
      { issue: issueKey },
    );
  });

  describe('create', () => {
    it('onboards, persists the hash, and returns the plaintext key exactly once', async () => {
      const result = await service.create(dto);

      expect(onboard).toHaveBeenCalledWith({
        baseUrl: dto.baseUrl,
        theirApiKey: dto.theirApiKey,
        timeoutMs: 5_000,
      });
      const createCall = (create.mock.calls[0] as unknown[])[0] as {
        data: { apiKeyHash: string; ipAllowlist: string[] };
      };
      expect(createCall.data.apiKeyHash).toBe('hash-1');
      expect(createCall.data.ipAllowlist).toEqual([]);
      expect(result.issuedApiKey).toBe('ak_live_new');
      expect(executeRawUnsafe).toHaveBeenCalledWith('NOTIFY peers_changed');
    });

    it('never exposes theirApiKey/apiKeyHash on the response', async () => {
      const result = await service.create(dto);
      expect(result).not.toHaveProperty('theirApiKey');
      expect(result).not.toHaveProperty('apiKeyHash');
    });

    it('translates a unique constraint violation into ConflictException', async () => {
      create.mockRejectedValue(knownRequestError('P2002'));
      await expect(service.create(dto as never)).rejects.toThrow(ConflictException);
    });

    it('rethrows a database error unrelated to the unique constraint as-is', async () => {
      create.mockRejectedValue(knownRequestError('P2003'));
      await expect(service.create(dto as never)).rejects.toMatchObject({ code: 'P2003' });
    });

    it('propagates onboarding failures without writing to the database', async () => {
      onboard.mockRejectedValue(new Error('unreachable'));
      await expect(service.create(dto as never)).rejects.toThrow('unreachable');
      expect(create).not.toHaveBeenCalled();
    });

    it('translates a peer manifest validation failure into ServiceUnavailableException', async () => {
      onboard.mockRejectedValue(
        new PeerUnreachableError(
          'Could not validate the peer\'s manifest at "https://acme.example/sensor-nodes": timed out',
        ),
      );
      await expect(service.create(dto as never)).rejects.toThrow(ServiceUnavailableException);
      await expect(service.create(dto as never)).rejects.toThrow(/timed out/);
      expect(create).not.toHaveBeenCalled();
    });
  });

  describe('findAll', () => {
    it('paginates and clamps pageSize', async () => {
      await service.findAll(1, 10_000);
      expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 200, skip: 0 }));
    });
  });

  describe('findOne', () => {
    it('returns the mapped peer when it exists', async () => {
      const result = await service.findOne('peer-1');
      expect(findUnique).toHaveBeenCalledWith({ where: { id: 'peer-1' } });
      expect(result).toMatchObject({ id: 'peer-1', name: 'acme' });
      expect(result).not.toHaveProperty('theirApiKey');
    });

    it('throws NotFoundException when the peer does not exist', async () => {
      findUnique.mockResolvedValue(null);
      await expect(service.findOne('missing')).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('notifies peers_changed after a successful update', async () => {
      await service.update('peer-1', { name: 'acme-renamed' });
      expect(executeRawUnsafe).toHaveBeenCalledWith('NOTIFY peers_changed');
    });

    it('translates a missing row into NotFoundException', async () => {
      update.mockRejectedValue(knownRequestError('P2025'));
      await expect(service.update('missing', { name: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('rethrows a database error unrelated to a missing row as-is', async () => {
      update.mockRejectedValue(knownRequestError('P2002'));
      await expect(service.update('peer-1', { name: 'x' })).rejects.toMatchObject({
        code: 'P2002',
      });
    });
  });

  describe('remove', () => {
    it('notifies peers_changed after a successful delete', async () => {
      await service.remove('peer-1');
      expect(executeRawUnsafe).toHaveBeenCalledWith('NOTIFY peers_changed');
    });

    it('translates a missing row into NotFoundException', async () => {
      del.mockRejectedValue(knownRequestError('P2025'));
      await expect(service.remove('missing')).rejects.toThrow(NotFoundException);
    });

    it('rethrows a database error unrelated to a missing row as-is', async () => {
      del.mockRejectedValue(knownRequestError('P2002'));
      await expect(service.remove('peer-1')).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  describe('rotateKey', () => {
    it('issues a fresh key, overwrites apiKeyHash, and returns the plaintext once', async () => {
      const result = await service.rotateKey('peer-1');

      expect(issueKey).toHaveBeenCalled();
      expect(update).toHaveBeenCalledWith({
        where: { id: 'peer-1' },
        data: { apiKeyHash: 'hash-rotated' },
      });
      expect(result).toEqual({ id: 'peer-1', issuedApiKey: 'ak_live_rotated' });
      expect(executeRawUnsafe).toHaveBeenCalledWith('NOTIFY peers_changed');
    });

    it('translates a missing row into NotFoundException', async () => {
      update.mockRejectedValue(knownRequestError('P2025'));
      await expect(service.rotateKey('missing')).rejects.toThrow(NotFoundException);
    });

    it('rethrows a database error unrelated to a missing row as-is', async () => {
      update.mockRejectedValue(knownRequestError('P2002'));
      await expect(service.rotateKey('peer-1')).rejects.toMatchObject({ code: 'P2002' });
    });
  });

  describe('resolve', () => {
    it('delegates to the peer cache', () => {
      getById.mockReturnValue({ id: 'peer-1' });
      expect(service.resolve('peer-1')).toEqual({ id: 'peer-1' });
      expect(getById).toHaveBeenCalledWith('peer-1');
    });
  });

  describe('seedPeers', () => {
    it('creates a valid seed entry through the normal create() path', async () => {
      await service.seedPeers([
        {
          name: 'seed-peer',
          baseUrl: 'https://seed.example',
          theirApiKey: 'k',
          scopes: ['plate:write'],
        },
      ]);
      expect(create).toHaveBeenCalled();
    });

    it('skips an entry that fails CreatePeerDto validation without throwing', async () => {
      await expect(service.seedPeers([{ name: '' }])).resolves.toBeUndefined();
      expect(onboard).not.toHaveBeenCalled();
    });

    it('treats an already-registered seed peer as a no-op, not a failure', async () => {
      create.mockRejectedValue(knownRequestError('P2002'));
      await expect(
        service.seedPeers([
          {
            name: 'seed-peer',
            baseUrl: 'https://seed.example',
            theirApiKey: 'k',
            scopes: ['plate:write'],
          },
        ]),
      ).resolves.toBeUndefined();
    });

    it('logs and continues past an onboarding failure for one entry', async () => {
      onboard.mockRejectedValueOnce(new Error('peer offline'));
      await expect(
        service.seedPeers([
          {
            name: 'seed-peer',
            baseUrl: 'https://seed.example',
            theirApiKey: 'k',
            scopes: ['plate:write'],
          },
        ]),
      ).resolves.toBeUndefined();
    });
  });
});
