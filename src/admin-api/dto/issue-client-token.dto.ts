import { IsArray, IsOptional, IsString, MinLength } from 'class-validator';

export class IssueClientTokenDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ipAllowlist?: string[];
}
