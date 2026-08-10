import { ApiProperty } from '@nestjs/swagger';

export class OperationLogSummaryEntryDto {
  @ApiProperty({ example: '2026-08-06' })
  date!: string;

  @ApiProperty({ example: 'analytics_batch_received' })
  operationType!: string;

  @ApiProperty({ example: 42 })
  count!: number;
}
