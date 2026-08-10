import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { OperationLogSummaryEntryDto } from '../dto/operation-log-summary-entry.dto';

export function ApiOperationLogController() {
  return applyDecorators(ApiTags('admin-operation-log'), ApiSecurity('AdminToken'));
}

export function ApiGetOperationLogSummary() {
  return applyDecorators(
    ApiOperation({
      summary: 'Daily operation count by type',
      description:
        'Volume of operations recorded by operation-log (design aba 06), grouped by day and operation type, over a from/to window. Defaults to the last 30 days when neither is given.',
    }),
    ApiOkResponse({ type: [OperationLogSummaryEntryDto] }),
  );
}
