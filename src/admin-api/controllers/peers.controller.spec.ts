import { PeersAdminController } from './peers.controller';

describe('PeersAdminController', () => {
  let findAll: jest.Mock;
  let findOne: jest.Mock;
  let create: jest.Mock;
  let update: jest.Mock;
  let remove: jest.Mock;
  let rotateKey: jest.Mock;
  let controller: PeersAdminController;

  beforeEach(() => {
    findAll = jest.fn().mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
    findOne = jest.fn().mockResolvedValue({ id: 'peer-1' });
    create = jest.fn().mockResolvedValue({ id: 'peer-1' });
    update = jest.fn().mockResolvedValue({ id: 'peer-1' });
    remove = jest.fn().mockResolvedValue(undefined);
    rotateKey = jest.fn().mockResolvedValue({ id: 'peer-1', issuedApiKey: 'ak_live_new' });
    controller = new PeersAdminController({
      findAll,
      findOne,
      create,
      update,
      remove,
      rotateKey,
    } as never);
  });

  it('list() forwards page/pageSize to PeersService.findAll()', async () => {
    await controller.list({ page: 2, pageSize: 10 });
    expect(findAll).toHaveBeenCalledWith(2, 10);
  });

  it('list() forwards undefined when no query is given', async () => {
    await controller.list({});
    expect(findAll).toHaveBeenCalledWith(undefined, undefined);
  });

  it('findOne() delegates by id', async () => {
    await controller.findOne('peer-1');
    expect(findOne).toHaveBeenCalledWith('peer-1');
  });

  it('create() delegates the DTO as-is', async () => {
    const dto = { name: 'acme' };
    await controller.create(dto as never);
    expect(create).toHaveBeenCalledWith(dto);
  });

  it('update() delegates id and patch', async () => {
    const dto = { name: 'renamed' };
    await controller.update('peer-1', dto);
    expect(update).toHaveBeenCalledWith('peer-1', dto);
  });

  it('remove() delegates by id', async () => {
    await controller.remove('peer-1');
    expect(remove).toHaveBeenCalledWith('peer-1');
  });

  it('rotateKey() delegates by id', async () => {
    const result = await controller.rotateKey('peer-1');
    expect(rotateKey).toHaveBeenCalledWith('peer-1');
    expect(result).toEqual({ id: 'peer-1', issuedApiKey: 'ak_live_new' });
  });
});
