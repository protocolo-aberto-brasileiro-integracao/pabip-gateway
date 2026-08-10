import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resetConfigFileCache } from './config-file.loader';
import { EntitySeedService } from './entity-seed.service';
import type { AdminTokenSeedWriter, PeerSeedWriter } from './entity-seed.tokens';

const ORIGINAL_ENV = { ...process.env };
const EMPTY_CONFIG_FILE = join(tmpdir(), 'does-not-exist-entity-seed.yaml');

describe('EntitySeedService', () => {
  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    process.env.GATEWAY_CONFIG_FILE = EMPTY_CONFIG_FILE;
    resetConfigFileCache();
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    resetConfigFileCache();
  });

  it('does nothing when there is no peer or admin token seed', async () => {
    const service = new EntitySeedService({} as never, undefined, undefined);
    await expect(service.onApplicationBootstrap()).resolves.toBeUndefined();
  });

  it('forwards the raw peer seed to the bound writer', async () => {
    process.env.GATEWAY_CONFIG_FILE = writeFixture(
      'peer:\n  - name: partner-a\n    baseUrl: https://a\n',
    );
    const peerSeedWriter = {
      seedPeers: jest.fn().mockResolvedValue(undefined),
    } satisfies PeerSeedWriter;

    const service = new EntitySeedService({} as never, peerSeedWriter, undefined);
    await service.onApplicationBootstrap();

    expect(peerSeedWriter.seedPeers).toHaveBeenCalledWith([
      { name: 'partner-a', baseUrl: 'https://a' },
    ]);
  });

  it('logs a warning and skips when a peer seed exists but no writer is bound', async () => {
    process.env.GATEWAY_CONFIG_FILE = writeFixture(
      'peer:\n  - name: partner-a\n    baseUrl: https://a\n',
    );
    const service = new EntitySeedService({} as never, undefined, undefined);
    const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

    await service.onApplicationBootstrap();

    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('no peer seed writer is bound'));
  });

  it('forwards the resolved admin tokens seed to the bound writer', async () => {
    process.env.GATEWAY_ADMIN_TOKENS = 'token-a,token-b';
    const adminTokenSeedWriter = {
      seedAdminTokens: jest.fn().mockResolvedValue(undefined),
    } satisfies AdminTokenSeedWriter;

    const service = new EntitySeedService({} as never, undefined, adminTokenSeedWriter);
    await service.onApplicationBootstrap();

    expect(adminTokenSeedWriter.seedAdminTokens).toHaveBeenCalledWith(['token-a', 'token-b']);
  });

  it('logs a warning and skips when an admin token seed exists but no writer is bound', async () => {
    process.env.GATEWAY_ADMIN_TOKENS = 'token-a';
    const service = new EntitySeedService({} as never, undefined, undefined);
    const warnSpy = jest.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);

    await service.onApplicationBootstrap();

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('no admin token seed writer is bound'),
    );
  });

  it('still invokes a bound admin token writer with an empty list (fail-closed check lives there)', async () => {
    const adminTokenSeedWriter = {
      seedAdminTokens: jest.fn().mockResolvedValue(undefined),
    } satisfies AdminTokenSeedWriter;
    const service = new EntitySeedService({} as never, undefined, adminTokenSeedWriter);

    await service.onApplicationBootstrap();

    expect(adminTokenSeedWriter.seedAdminTokens).toHaveBeenCalledWith([]);
  });

  it('propagates a fail-closed rejection from the bound admin token writer', async () => {
    const adminTokenSeedWriter: AdminTokenSeedWriter = {
      seedAdminTokens: jest.fn().mockRejectedValue(new Error('no admin token configured')),
    };
    const service = new EntitySeedService({} as never, undefined, adminTokenSeedWriter);

    await expect(service.onApplicationBootstrap()).rejects.toThrow('no admin token configured');
  });
});

function writeFixture(contents: string): string {
  const dir = mkdtempSync(join(tmpdir(), 'gateway-entity-seed-'));
  const path = join(dir, 'gateway.config.yaml');
  writeFileSync(path, contents);
  return path;
}
