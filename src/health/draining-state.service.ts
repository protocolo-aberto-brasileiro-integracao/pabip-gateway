import { Injectable } from '@nestjs/common';

@Injectable()
export class DrainingStateService {
  private draining = false;

  isDraining(): boolean {
    return this.draining;
  }

  setDraining(draining: boolean): void {
    this.draining = draining;
  }
}
