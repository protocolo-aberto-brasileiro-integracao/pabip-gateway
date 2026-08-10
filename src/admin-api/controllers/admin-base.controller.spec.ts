import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminTokenGuard } from '../../auth/guards/admin-token.guard';
import { PeersAccessGuard } from '../../auth/guards/peers-access.guard';
import { AdminBaseController } from './admin-base.controller';
import { ClientTokensAdminController } from './client-tokens.controller';
import { ConfigAdminController } from './config.controller';
import { PassthroughController } from './passthrough.controller';
import { PeersAdminController } from './peers.controller';
import { TokensAdminController } from './tokens.controller';

describe('AdminBaseController guard wiring', () => {
  it('decorates AdminTokenGuard directly on the base controller', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminBaseController)).toEqual([AdminTokenGuard]);
  });

  it.each([
    ['PeersAdminController', PeersAdminController],
    ['TokensAdminController', TokensAdminController],
    ['ClientTokensAdminController', ClientTokensAdminController],
    ['ConfigAdminController', ConfigAdminController],
  ])('%s inherits AdminTokenGuard without its own @UseGuards', (_name, controller) => {
    expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([AdminTokenGuard]);
    expect(Object.getPrototypeOf(controller)).toBe(AdminBaseController);
  });

  it('PassthroughController applies PeersAccessGuard directly, not AdminBaseController/AdminTokenGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, PassthroughController)).toEqual([PeersAccessGuard]);
    expect(Object.getPrototypeOf(PassthroughController)).not.toBe(AdminBaseController);
  });
});
