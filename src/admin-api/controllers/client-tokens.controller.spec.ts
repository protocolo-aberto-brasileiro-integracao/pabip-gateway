import { ClientTokensAdminController } from './client-tokens.controller';

describe('ClientTokensAdminController', () => {
  let list: jest.Mock;
  let issue: jest.Mock;
  let revoke: jest.Mock;
  let controller: ClientTokensAdminController;

  const summaries = Array.from({ length: 25 }, (_, i) => ({
    id: `clt-${i}`,
    label: null,
    createdAt: new Date(),
  }));

  beforeEach(() => {
    list = jest.fn().mockResolvedValue(summaries);
    issue = jest
      .fn()
      .mockResolvedValue({ id: 'clt-new', token: 'clt_new', label: null, createdAt: new Date() });
    revoke = jest.fn().mockResolvedValue(undefined);
    controller = new ClientTokensAdminController({ list, issue, revoke } as never);
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

  it('create() forwards the optional label and ipAllowlist, and returns the plaintext token', async () => {
    const result = await controller.create({
      label: 'frontend-prod',
      ipAllowlist: ['203.0.113.5'],
    });
    expect(issue).toHaveBeenCalledWith('frontend-prod', ['203.0.113.5']);
    expect(result.token).toBe('clt_new');
  });

  it('remove() delegates to ClientTokenService.revoke() by id', async () => {
    await controller.remove('clt-1');
    expect(revoke).toHaveBeenCalledWith('clt-1');
  });
});
