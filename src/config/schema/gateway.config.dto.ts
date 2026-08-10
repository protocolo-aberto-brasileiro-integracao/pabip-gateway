import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

export class TlsConfigDto {
  @IsOptional()
  @IsString()
  certPath?: string;

  @IsOptional()
  @IsString()
  keyPath?: string;
}

export class GatewayConfigDto {
  @IsBoolean()
  devMode!: boolean;

  @IsString()
  entePublicoName!: string;

  @ValidateNested()
  @Type(() => TlsConfigDto)
  tls!: TlsConfigDto;

  @IsInt()
  @Min(1)
  @Max(65535)
  publicPort!: number;

  @IsInt()
  @Min(1)
  @Max(65535)
  adminPort!: number;

  @IsString()
  trustedProxyCidrs!: string;

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  adminTokens?: string[];
}
