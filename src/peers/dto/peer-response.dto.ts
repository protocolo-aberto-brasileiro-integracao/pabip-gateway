export class PeerResponseDto {
  id!: string;
  name!: string;
  baseUrl!: string;
  scopes!: string[];
  ipAllowlist!: string[];
  capabilities!: string[];
  createdAt!: Date;
  updatedAt!: Date;

  issuedApiKey?: string;
}
