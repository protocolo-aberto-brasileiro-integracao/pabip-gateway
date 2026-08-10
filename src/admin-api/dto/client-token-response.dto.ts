export class ClientTokenResponseDto {
  id!: string;
  label!: string | null;
  ipAllowlist!: string[];
  createdAt!: Date;
}

export class IssuedClientTokenResponseDto extends ClientTokenResponseDto {
  token!: string;
}
