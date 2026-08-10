import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class QueueConfigDto {
  @IsOptional()
  @IsString()
  brokerUrl?: string;

  @IsString()
  @IsNotEmpty()
  routingKeyTemplate!: string;
}
