import { IsOptional, IsString, MinLength } from 'class-validator';

export class IssueAdminTokenDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  label?: string;
}
