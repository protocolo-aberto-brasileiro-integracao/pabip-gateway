import { IsInt, IsNumber, Max, Min } from 'class-validator';

export class CircuitBreakerConfigDto {
  @IsNumber()
  @Min(0)
  @Max(1)
  errorThreshold!: number;

  @IsInt()
  @Min(1)
  windowSeconds!: number;
}
