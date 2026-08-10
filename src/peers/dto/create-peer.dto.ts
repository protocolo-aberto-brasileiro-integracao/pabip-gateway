import {
  ArrayNotEmpty,
  ArrayUnique,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  IsUrl,
  MinLength,
} from 'class-validator';
import { PEER_SCOPES } from '../peers.constants';

export class CreatePeerDto {
  @IsString()
  @MinLength(1)
  name!: string;

  @IsUrl({ require_tld: false }, { message: 'baseUrl must be a valid absolute URL' })
  baseUrl!: string;

  @IsString()
  @MinLength(1)
  theirApiKey!: string;

  @IsArray()
  @ArrayNotEmpty()
  @ArrayUnique()
  @IsIn(PEER_SCOPES, { each: true })
  scopes!: string[];

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  ipAllowlist?: string[];
}
