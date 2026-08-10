import { ApiProperty } from '@nestjs/swagger';

export class IngestResponseDto {
  @ApiProperty()
  batchId!: string;

  @ApiProperty()
  acceptedCount!: number;
}
