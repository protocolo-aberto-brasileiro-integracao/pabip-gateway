import { IsInt, Min } from 'class-validator';

export class ShutdownConfigDto {
  @IsInt()
  @Min(1)
  gracePeriodSeconds!: number;
}
