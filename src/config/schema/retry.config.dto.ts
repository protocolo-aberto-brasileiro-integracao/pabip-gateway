import { IsInt, Max, Min } from 'class-validator';

export class RetryConfigDto {
  @IsInt()
  @Min(0)
  maxAttempts!: number;

  @IsInt()
  @Min(0)
  baseDelayMs!: number;

  @IsInt()
  @Min(0)
  @Max(100)
  jitterPct!: number;
}
