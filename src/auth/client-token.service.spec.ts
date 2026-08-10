import { ClientTokenService, type ClientTokenSummary } from './client-token.service';
import { hashSecret } from './crypto.util';

describe('ClientTokenService', () => {
  let create: jest.Mock;
  let findMany: jest.Mock;
  let deleteMany: jest.Mock;
  let findUnique: jest.Mock;
  let prisma: {
    clientToken: {
      create: jest.Mock;
      findMany: jest.Mock;
      deleteMany: jest.Mock;
      findUnique: jest.Mock;
    };
  };
  let service: ClientTokenService;

  beforeEach(() => {
    create = jest.fn();
    findMany = jest.fn();
    deleteMany = jest.fn();
    findUnique = jest.fn();
    prisma = { clientToken: { create, findMany, deleteMany, findUnique } };
    service = new ClientTokenService(prisma as never);
  });

  describe('issue', () => {
    it('generates a "clt_" token, persists only its hash, and returns the plaintext once', async () => {
      create.mockImplementation(
        ({ data }: { data: { tokenHash: string; label: string | null; ipAllowlist: string[] } }) =>
          Promise.resolve({
            id: 'clt-1',
            tokenHash: data.tokenHash,
            label: data.label,
            ipAllowlist: data.ipAllowlist,
            createdAt: new Date(),
          }),
      );

      const result = await service.issue('frontend-prod');

      expect(result.token.startsWith('clt_')).toBe(true);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { tokenHash: hashSecret(result.token), label: 'frontend-prod', ipAllowlist: [] },
        }),
      );
    });

    it('persists an explicit ipAllowlist when given one', async () => {
      create.mockImplementation(
        ({ data }: { data: { tokenHash: string; label: string | null; ipAllowlist: string[] } }) =>
          Promise.resolve({
            id: 'clt-1',
            tokenHash: data.tokenHash,
            label: data.label,
            ipAllowlist: data.ipAllowlist,
            createdAt: new Date(),
          }),
      );

      const result = await service.issue('frontend-prod', ['203.0.113.5']);

      expect(result.ipAllowlist).toEqual(['203.0.113.5']);
    });
  });

  describe('list', () => {
    it('never returns tokenHash', async () => {
      findMany.mockResolvedValue([
        {
          id: 'clt-1',
          tokenHash: 'irrelevant-hash',
          label: 'a',
          ipAllowlist: [],
          createdAt: new Date(),
        },
      ]);

      const [summary]: ClientTokenSummary[] = await service.list();

      expect(summary.id).toBe('clt-1');
      expect(summary.label).toBe('a');
      expect(summary).not.toHaveProperty('tokenHash');
    });
  });

  describe('revoke', () => {
    it('deletes by id and is a no-op if nothing matched', async () => {
      deleteMany.mockResolvedValue({ count: 0 });
      await expect(service.revoke('does-not-exist')).resolves.toBeUndefined();
      expect(deleteMany).toHaveBeenCalledWith({ where: { id: 'does-not-exist' } });
    });
  });

  describe('resolve', () => {
    it('returns null for an empty token without hitting the database', async () => {
      await expect(service.resolve('')).resolves.toBeNull();
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('returns the id and ipAllowlist when the hash matches a row', async () => {
      findUnique.mockResolvedValue({ id: 'clt-1', ipAllowlist: ['203.0.113.5'] });
      await expect(service.resolve('clt_something')).resolves.toEqual({
        id: 'clt-1',
        ipAllowlist: ['203.0.113.5'],
      });
      expect(findUnique).toHaveBeenCalledWith({
        where: { tokenHash: hashSecret('clt_something') },
      });
    });

    it('returns null when no row matches', async () => {
      findUnique.mockResolvedValue(null);
      await expect(service.resolve('clt_unknown')).resolves.toBeNull();
    });
  });
});
