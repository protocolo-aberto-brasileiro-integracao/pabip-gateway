import { IsBoolean } from 'class-validator';

export class EgressConfigDto {
  @IsBoolean()
  requireHttps!: boolean;

  @IsBoolean()
  allowPrivateDestinations!: boolean;
}
