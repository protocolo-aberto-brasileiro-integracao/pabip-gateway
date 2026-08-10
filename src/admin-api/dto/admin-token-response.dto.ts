export class AdminTokenResponseDto {
  id!: string;
  label!: string | null;
  createdAt!: Date;
}

export class IssuedAdminTokenResponseDto extends AdminTokenResponseDto {
  token!: string;
}
