import { Controller, Get, Query } from '@nestjs/common';
import {
  MS_PER_DAY,
  OPERATION_LOG_RETENTION_DAYS,
} from '../../operation-log/operation-log.constants';
import { OperationLogService } from '../../operation-log/operation-log.service';
import { OperationLogSummaryQueryDto } from '../dto/operation-log-summary-query.dto';
import type { OperationLogSummaryEntryDto } from '../dto/operation-log-summary-entry.dto';
import { AdminBaseController } from './admin-base.controller';
import { ApiGetOperationLogSummary, ApiOperationLogController } from './operation-log.docs';

@ApiOperationLogController()
@Controller('admin/operation-log')
export class OperationLogAdminController extends AdminBaseController {
  constructor(private readonly operationLogService: OperationLogService) {
    super();
  }

  @Get('summary')
  @ApiGetOperationLogSummary()
  summary(@Query() query: OperationLogSummaryQueryDto): Promise<OperationLogSummaryEntryDto[]> {
    const to = query.to ? new Date(query.to) : new Date();
    const from = query.from
      ? new Date(query.from)
      : new Date(to.getTime() - OPERATION_LOG_RETENTION_DAYS * MS_PER_DAY);
    return this.operationLogService.summarize(from, to);
  }
}
