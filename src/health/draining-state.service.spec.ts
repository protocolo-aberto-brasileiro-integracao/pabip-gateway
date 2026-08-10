import { DrainingStateService } from './draining-state.service';

describe('DrainingStateService', () => {
  it('defaults to not draining', () => {
    expect(new DrainingStateService().isDraining()).toBe(false);
  });

  it('reflects whatever setDraining() was last called with', () => {
    const service = new DrainingStateService();

    service.setDraining(true);
    expect(service.isDraining()).toBe(true);

    service.setDraining(false);
    expect(service.isDraining()).toBe(false);
  });
});
