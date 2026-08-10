import { IsNotEmptyObject, IsObject } from 'class-validator';

export class UpdateConfigDto {
  @IsObject()
  @IsNotEmptyObject()
  values!: Record<string, unknown>;
}
