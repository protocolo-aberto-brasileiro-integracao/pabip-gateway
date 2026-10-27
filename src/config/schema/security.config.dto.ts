import { IsOptional, IsString } from 'class-validator';

export class SecurityConfigDto {
  @IsOptional()
  @IsString()
  secretEncryptionKey?: string;
}
