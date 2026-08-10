import { IsObject, IsOptional, IsString } from 'class-validator';

export class CallbackConfigDto {
  @IsOptional()
  @IsString()
  url?: string;

  @IsOptional()
  @IsObject()
  headers?: Record<string, string>;
}
