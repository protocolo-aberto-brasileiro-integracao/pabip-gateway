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
  AdminTokenResponseDto,
  IssuedAdminTokenResponseDto,
} from '../dto/admin-token-response.dto';

export function ApiTokensController() {
  return applyDecorators(ApiTags('admin-tokens'), ApiSecurity('AdminToken'));
}

export function ApiListTokens() {
  return applyDecorators(
    ApiOperation({
      summary: 'List admin tokens',
      description: 'Never returns the token itself, only id/label/createdAt.',
    }),
    ApiQuery({ name: 'page', required: false, type: Number }),
    ApiQuery({ name: 'pageSize', required: false, type: Number }),
    ApiOkResponse({ type: AdminTokenResponseDto, isArray: true }),
  );
}

export function ApiIssueToken() {
  return applyDecorators(
    ApiOperation({
      summary: 'Issue a new admin token',
      description:
        'Any already-valid token can call this — rotation-with-overlap, not a privileged operation.',
    }),
    ApiCreatedResponse({ type: IssuedAdminTokenResponseDto }),
  );
}

export function ApiRevokeToken() {
  return applyDecorators(
    ApiOperation({
      summary: 'Revoke an admin token',
      description:
        'Idempotent — revoking an already-revoked or unknown id is a no-op, not an error.',
    }),
    ApiParam({ name: 'id' }),
    ApiNoContentResponse(),
  );
}
