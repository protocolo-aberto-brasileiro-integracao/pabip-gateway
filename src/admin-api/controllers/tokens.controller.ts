import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import {
  AdminTokenService,
  type IssuedAdminToken,
  type AdminTokenSummary,
} from '../../auth/admin-token.service';
import { IssueAdminTokenDto } from '../dto/issue-admin-token.dto';
import type { PaginatedResult } from '../dto/paginated-result';
import { PaginationQueryDto } from '../dto/pagination-query.dto';
import { AdminBaseController } from './admin-base.controller';
import { ApiIssueToken, ApiListTokens, ApiRevokeToken, ApiTokensController } from './tokens.docs';

const DEFAULT_PAGE_SIZE = 20;

@ApiTokensController()
@Controller('admin/tokens')
export class TokensAdminController extends AdminBaseController {
  constructor(private readonly adminTokens: AdminTokenService) {
    super();
  }

  @Get()
  @ApiListTokens()
  async list(@Query() query: PaginationQueryDto): Promise<PaginatedResult<AdminTokenSummary>> {
    const all = await this.adminTokens.list();
    const page = Math.max(1, query.page ?? 1);
    const pageSize = Math.max(1, query.pageSize ?? DEFAULT_PAGE_SIZE);
    const start = (page - 1) * pageSize;

    return {
      items: all.slice(start, start + pageSize),
      total: all.length,
      page,
      pageSize,
    };
  }

  @Post()
  @ApiIssueToken()
  create(@Body() dto: IssueAdminTokenDto): Promise<IssuedAdminToken> {
    return this.adminTokens.issue(dto.label);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiRevokeToken()
  remove(@Param('id') id: string): Promise<void> {
    return this.adminTokens.revoke(id);
  }
}
