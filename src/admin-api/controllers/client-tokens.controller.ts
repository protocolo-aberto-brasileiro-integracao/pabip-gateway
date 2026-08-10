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
  ClientTokenService,
  type IssuedClientToken,
  type ClientTokenSummary,
} from '../../auth/client-token.service';
import { IssueClientTokenDto } from '../dto/issue-client-token.dto';
import type { PaginatedResult } from '../dto/paginated-result';
import { PaginationQueryDto } from '../dto/pagination-query.dto';
import { AdminBaseController } from './admin-base.controller';
import {
  ApiClientTokensController,
  ApiIssueClientToken,
  ApiListClientTokens,
  ApiRevokeClientToken,
} from './client-tokens.docs';

const DEFAULT_PAGE_SIZE = 20;

@ApiClientTokensController()
@Controller('admin/client-tokens')
export class ClientTokensAdminController extends AdminBaseController {
  constructor(private readonly clientTokens: ClientTokenService) {
    super();
  }

  @Get()
  @ApiListClientTokens()
  async list(@Query() query: PaginationQueryDto): Promise<PaginatedResult<ClientTokenSummary>> {
    const all = await this.clientTokens.list();
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
  @ApiIssueClientToken()
  create(@Body() dto: IssueClientTokenDto): Promise<IssuedClientToken> {
    return this.clientTokens.issue(dto.label, dto.ipAllowlist);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiRevokeClientToken()
  remove(@Param('id') id: string): Promise<void> {
    return this.clientTokens.revoke(id);
  }
}
