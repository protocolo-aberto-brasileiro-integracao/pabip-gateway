import { IsInt, Min } from 'class-validator';

export class DeliveryConfigDto {
  @IsInt()
  @Min(1)
  maxConcurrentPerPeer!: number;

  @IsInt()
  @Min(1)
  maxAttempts!: number;

  @IsInt()
  @Min(1)
  windowSeconds!: number;
}
