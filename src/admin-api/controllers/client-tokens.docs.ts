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
import {
  ClientTokenResponseDto,
  IssuedClientTokenResponseDto,
} from '../dto/client-token-response.dto';

export function ApiClientTokensController() {
  return applyDecorators(ApiTags('admin-client-tokens'), ApiSecurity('AdminToken'));
}

export function ApiListClientTokens() {
  return applyDecorators(
    ApiOperation({
      summary: 'List client tokens',
      description:
        'Never returns the token itself, only id/label/createdAt. These authenticate ' +
        '/peers/* only, never /admin/* (see PeersAccessGuard).',
    }),
    ApiQuery({ name: 'page', required: false, type: Number }),
    ApiQuery({ name: 'pageSize', required: false, type: Number }),
    ApiOkResponse({ type: ClientTokenResponseDto, isArray: true }),
  );
}

export function ApiIssueClientToken() {
  return applyDecorators(
    ApiOperation({
      summary: 'Issue a new client token',
      description:
        'Hand this to whatever frontend/system should read/act on /peers/* without needing ' +
        'the full AdminToken.',
    }),
    ApiCreatedResponse({ type: IssuedClientTokenResponseDto }),
  );
}

export function ApiRevokeClientToken() {
  return applyDecorators(
    ApiOperation({
      summary: 'Revoke a client token',
      description:
        'Idempotent — revoking an already-revoked or unknown id is a no-op, not an error.',
    }),
    ApiParam({ name: 'id' }),
    ApiNoContentResponse(),
  );
}
