import { IsISO8601, IsOptional } from 'class-validator';

export class VideoSessionRequestDto {
  @IsOptional()
  @IsISO8601()
  startDate?: string;

  @IsOptional()
  @IsISO8601()
  endDate?: string;
}
