import { AdminTokenService, type AdminTokenSummary } from './admin-token.service';
import { hashSecret } from './crypto.util';

describe('AdminTokenService', () => {
  let create: jest.Mock;
  let findMany: jest.Mock;
  let deleteMany: jest.Mock;
  let findUnique: jest.Mock;
  let upsert: jest.Mock;
  let count: jest.Mock;
  let prisma: {
    adminToken: {
      create: jest.Mock;
      findMany: jest.Mock;
      deleteMany: jest.Mock;
      findUnique: jest.Mock;
      upsert: jest.Mock;
      count: jest.Mock;
    };
  };
  let service: AdminTokenService;

  beforeEach(() => {
    create = jest.fn();
    findMany = jest.fn();
    deleteMany = jest.fn();
    findUnique = jest.fn();
    upsert = jest.fn();
    count = jest.fn();
    prisma = { adminToken: { create, findMany, deleteMany, findUnique, upsert, count } };
    service = new AdminTokenService(prisma as never);
  });

  describe('issue', () => {
    it('generates an "adm_" token, persists only its hash, and returns the plaintext once', async () => {
      create.mockImplementation(({ data }: { data: { tokenHash: string; label: string | null } }) =>
        Promise.resolve({
          id: 'tok-1',
          tokenHash: data.tokenHash,
          label: data.label,
          createdAt: new Date(),
        }),
      );

      const result = await service.issue('ci-pipeline');

      expect(result.token.startsWith('adm_')).toBe(true);
      expect(create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { tokenHash: hashSecret(result.token), label: 'ci-pipeline' },
        }),
      );
    });
  });

  describe('list', () => {
    it('never returns tokenHash', async () => {
      findMany.mockResolvedValue([
        { id: 'tok-1', tokenHash: 'irrelevant-hash', label: 'a', createdAt: new Date() },
      ]);

      const [summary]: AdminTokenSummary[] = await service.list();

      expect(summary.id).toBe('tok-1');
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

  describe('validate', () => {
    it('returns false for an empty token without hitting the database', async () => {
      await expect(service.validate('')).resolves.toBe(false);
      expect(findUnique).not.toHaveBeenCalled();
    });

    it('returns true when the hash matches a row', async () => {
      findUnique.mockResolvedValue({ id: 'tok-1' });
      await expect(service.validate('adm_something')).resolves.toBe(true);
      expect(findUnique).toHaveBeenCalledWith({
        where: { tokenHash: hashSecret('adm_something') },
      });
    });

    it('returns false when no row matches', async () => {
      findUnique.mockResolvedValue(null);
      await expect(service.validate('adm_unknown')).resolves.toBe(false);
    });
  });

  describe('seedAdminTokens', () => {
    it('upserts every raw token by its hash', async () => {
      upsert.mockResolvedValue(undefined);
      count.mockResolvedValue(2);

      await service.seedAdminTokens(['adm_a', 'adm_b']);

      expect(upsert).toHaveBeenCalledTimes(2);
      expect(upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { tokenHash: hashSecret('adm_a') } }),
      );
    });

    it('is a no-op re-seed once the tokens already exist (idempotent by hash)', async () => {
      upsert.mockResolvedValue(undefined);
      count.mockResolvedValue(1);

      await expect(service.seedAdminTokens(['adm_a'])).resolves.toBeUndefined();
    });

    it('fails closed when seeding ends with zero admin tokens on record', async () => {
      count.mockResolvedValue(0);

      await expect(service.seedAdminTokens([])).rejects.toThrow('No admin token is configured');
    });

    it('does not throw when the seed list is empty but tokens already exist from an earlier boot', async () => {
      count.mockResolvedValue(3);

      await expect(service.seedAdminTokens([])).resolves.toBeUndefined();
      expect(upsert).not.toHaveBeenCalled();
    });
  });
});
