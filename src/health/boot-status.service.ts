import { Injectable } from '@nestjs/common';

@Injectable()
export class BootStatusService {
  private configMigrated = false;

  markConfigMigrated(): void {
    this.configMigrated = true;
  }

  isConfigMigrated(): boolean {
    return this.configMigrated;
  }
}
