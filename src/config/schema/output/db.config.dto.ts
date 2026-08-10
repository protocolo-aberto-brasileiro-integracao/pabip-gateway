import { IsOptional, IsString } from 'class-validator';

export class DbConfigDto {
  @IsOptional()
  @IsString()
  connectionString?: string;
}
