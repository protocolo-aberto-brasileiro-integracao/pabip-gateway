jest.mock('./boot-guard', () => ({
  resolveDatabaseUrl: jest.fn(() => 'postgresql://user:pass@host/db'),
  resolveDevMode: jest.fn(() => false),
  assertDatabaseUrlAllowed: jest.fn(),
  assertSchemaVersion: jest.fn().mockResolvedValue(undefined),
}));

import * as bootGuard from './boot-guard';
import { PrismaService } from './prisma.service';

describe('PrismaService', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('resolves database.url/devMode from file/ENV and checks them before connecting', () => {
    const service = new PrismaService();

    expect(bootGuard.resolveDatabaseUrl).toHaveBeenCalled();
    expect(bootGuard.resolveDevMode).toHaveBeenCalled();
    expect(bootGuard.assertDatabaseUrlAllowed).toHaveBeenCalledWith(
      'postgresql://user:pass@host/db',
      false,
    );
    expect(service.databaseUrl).toBe('postgresql://user:pass@host/db');
  });

  it('propagates a boot-guard rejection instead of constructing a usable client', () => {
    (bootGuard.assertDatabaseUrlAllowed as jest.Mock).mockImplementationOnce(() => {
      throw new Error('SQLite is not supported in production');
    });

    expect(() => new PrismaService()).toThrow('SQLite is not supported in production');
  });

  it('connects and verifies the schema version on module init', async () => {
    const service = new PrismaService();
    const connectSpy = jest.spyOn(service, '$connect').mockResolvedValue(undefined);

    await service.onModuleInit();

    expect(connectSpy).toHaveBeenCalled();
    expect(bootGuard.assertSchemaVersion).toHaveBeenCalledWith(service);
  });

  it('disconnects on module destroy', async () => {
    const service = new PrismaService();
    const disconnectSpy = jest.spyOn(service, '$disconnect').mockResolvedValue(undefined);

    await service.onModuleDestroy();

    expect(disconnectSpy).toHaveBeenCalled();
  });
});
