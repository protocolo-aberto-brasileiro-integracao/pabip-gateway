import { TokensAdminController } from './tokens.controller';

describe('TokensAdminController', () => {
  let list: jest.Mock;
  let issue: jest.Mock;
  let revoke: jest.Mock;
  let controller: TokensAdminController;

  const summaries = Array.from({ length: 25 }, (_, i) => ({
    id: `tok-${i}`,
    label: null,
    createdAt: new Date(),
  }));

  beforeEach(() => {
    list = jest.fn().mockResolvedValue(summaries);
    issue = jest
      .fn()
      .mockResolvedValue({ id: 'tok-new', token: 'adm_new', label: null, createdAt: new Date() });
    revoke = jest.fn().mockResolvedValue(undefined);
    controller = new TokensAdminController({ list, issue, revoke } as never);
  });

  describe('list', () => {
    it('defaults to page 1 with a page size of 20', async () => {
      const result = await controller.list({});
      expect(result.page).toBe(1);
      expect(result.pageSize).toBe(20);
      expect(result.total).toBe(25);
      expect(result.items).toHaveLength(20);
      expect(result.items[0]).toEqual(summaries[0]);
    });

    it('honors an explicit page/pageSize', async () => {
      const result = await controller.list({ page: 2, pageSize: 10 });
      expect(result.items).toHaveLength(10);
      expect(result.items[0]).toEqual(summaries[10]);
    });

    it('clamps a page below 1 back to 1', async () => {
      const result = await controller.list({ page: 0 });
      expect(result.page).toBe(1);
    });
  });

  it('create() forwards the optional label and returns the plaintext token', async () => {
    const result = await controller.create({ label: 'ci-pipeline' });
    expect(issue).toHaveBeenCalledWith('ci-pipeline');
    expect(result.token).toBe('adm_new');
  });

  it('remove() delegates to AdminTokenService.revoke() by id', async () => {
    await controller.remove('tok-1');
    expect(revoke).toHaveBeenCalledWith('tok-1');
  });
});
