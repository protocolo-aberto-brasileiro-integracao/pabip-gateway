import { applyDecorators } from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiSecurity,
  ApiTags,
} from '@nestjs/swagger';
import { PeerResponseDto } from '../../peers/dto/peer-response.dto';
import { RotatePeerKeyResponseDto } from '../dto/rotate-peer-key-response.dto';

export function ApiPeersController() {
  return applyDecorators(ApiTags('admin-peers'), ApiSecurity('AdminToken'));
}

export function ApiListPeers() {
  return applyDecorators(
    ApiOperation({ summary: 'List registered Entes Privados' }),
    ApiQuery({ name: 'page', required: false, type: Number }),
    ApiQuery({ name: 'pageSize', required: false, type: Number }),
    ApiOkResponse({ type: PeerResponseDto, isArray: true }),
  );
}

export function ApiGetPeer() {
  return applyDecorators(
    ApiOperation({ summary: 'Get a single registered peer by id' }),
    ApiParam({ name: 'id' }),
    ApiOkResponse({ type: PeerResponseDto }),
  );
}

export function ApiCreatePeer() {
  return applyDecorators(
    ApiOperation({
      summary: 'Register a new Ente Privado',
      description: 'Validates the manifest and issues a key.',
    }),
    ApiCreatedResponse({ type: PeerResponseDto }),
  );
}

export function ApiUpdatePeer() {
  return applyDecorators(
    ApiOperation({ summary: 'Update a registered peer’s business fields' }),
    ApiParam({ name: 'id' }),
    ApiOkResponse({ type: PeerResponseDto }),
  );
}

export function ApiDeletePeer() {
  return applyDecorators(
    ApiOperation({ summary: 'Remove a registered peer' }),
    ApiParam({ name: 'id' }),
    ApiNoContentResponse(),
  );
}

export function ApiRotatePeerKey() {
  return applyDecorators(
    ApiOperation({
      summary: 'Rotate the key the gateway issued to this peer',
      description:
        'Issues a fresh key and immediately invalidates the previous one (no overlap window, unlike admin token rotation).',
    }),
    ApiParam({ name: 'id' }),
    ApiCreatedResponse({ type: RotatePeerKeyResponseDto }),
  );
}
