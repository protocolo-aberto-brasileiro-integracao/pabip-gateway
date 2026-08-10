import { Type } from 'class-transformer';
import { IsIn, ValidateNested } from 'class-validator';
import { CallbackConfigDto } from './output/callback.config.dto';
import { QueueConfigDto } from './output/queue.config.dto';
import { DbConfigDto } from './output/db.config.dto';

export const OUTPUT_TYPES = ['callback', 'queue', 'db'] as const;
export type OutputType = (typeof OUTPUT_TYPES)[number];

export class OutputConfigDto {
  @IsIn(OUTPUT_TYPES)
  type!: OutputType;

  @ValidateNested()
  @Type(() => CallbackConfigDto)
  callback!: CallbackConfigDto;

  @ValidateNested()
  @Type(() => QueueConfigDto)
  queue!: QueueConfigDto;

  @ValidateNested()
  @Type(() => DbConfigDto)
  db!: DbConfigDto;
}
