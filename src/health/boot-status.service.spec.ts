import { BootStatusService } from './boot-status.service';

describe('BootStatusService', () => {
  it('starts as not migrated', () => {
    const service = new BootStatusService();
    expect(service.isConfigMigrated()).toBe(false);
  });

  it('reports migrated once markConfigMigrated() is called', () => {
    const service = new BootStatusService();
    service.markConfigMigrated();
    expect(service.isConfigMigrated()).toBe(true);
  });
});
