import { UseGuards } from '@nestjs/common';
import { AdminTokenGuard } from '../../auth/guards/admin-token.guard';

@UseGuards(AdminTokenGuard)
export abstract class AdminBaseController {}
