import { applyDecorators } from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiSecurity, ApiTags } from '@nestjs/swagger';
import { GatewayConfigSchema } from '../../config/schema/gateway-config.schema';

export function ApiConfigController() {
  return applyDecorators(ApiTags('admin-config'), ApiSecurity('AdminToken'));
}

export function ApiReadConfig() {
  return applyDecorators(
    ApiOperation({
      summary: 'Export the current, fully-resolved gateway configuration',
      description:
        'Sensitive fields (the `sensitive` flag — connection strings, broker URLs) come back redacted, never in the clear.',
    }),
    ApiOkResponse({ type: GatewayConfigSchema }),
  );
}

export function ApiUpdateConfig() {
  return applyDecorators(
    ApiOperation({
      summary: 'Write one or more apiWritable config fields',
      description:
        'Admin API always wins the precedence chain ("Admin API > ENV > arquivo > default"). Boot-only fields are rejected with 400.',
    }),
    ApiOkResponse({ type: GatewayConfigSchema }),
  );
}
