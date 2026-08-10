import { PartialType, PickType } from '@nestjs/swagger';
import { CreatePeerDto } from '../../peers/dto/create-peer.dto';

export class UpdatePeerDto extends PartialType(
  PickType(CreatePeerDto, ['name', 'baseUrl', 'scopes', 'ipAllowlist'] as const),
) {}
