import { BadRequestException, Body, Controller, Get, Patch } from '@nestjs/common';
import { CONFIG_FIELDS } from '../../config/config.constants';
import { setPath } from '../../config/config-file.loader';
import { ConfigService } from '../../config/config.service';
import type { GatewayConfigSchema } from '../../config/schema/gateway-config.schema';
import { assertMatchesFieldType, REDACTED_CONFIG_VALUE } from '../config-value.util';
import { UpdateConfigDto } from '../dto/update-config.dto';
import { AdminBaseController } from './admin-base.controller';
import { ApiConfigController, ApiReadConfig, ApiUpdateConfig } from './config.docs';

@ApiConfigController()
@Controller('admin/config')
export class ConfigAdminController extends AdminBaseController {
  constructor(private readonly configService: ConfigService) {
    super();
  }

  @Get()
  @ApiReadConfig()
  read(): GatewayConfigSchema {
    return this.snapshot();
  }

  @Patch()
  @ApiUpdateConfig()
  async update(@Body() dto: UpdateConfigDto): Promise<GatewayConfigSchema> {
    for (const [key, value] of Object.entries(dto.values)) {
      const field = CONFIG_FIELDS.find((candidate) => candidate.key === key);
      if (!field) {
        throw new BadRequestException(`Unknown config key "${key}".`);
      }
      if (field.bootOnly) {
        throw new BadRequestException(
          `"${key}" is boot-only — file/ENV only, requires a restart — and cannot be changed via the Admin API.`,
        );
      }
      assertMatchesFieldType(key, value, field.type);
    }

    for (const [key, value] of Object.entries(dto.values)) {
      await this.configService.write(key, value);
    }

    return this.snapshot();
  }

  private snapshot(): GatewayConfigSchema {
    const tree = structuredClone({
      database: this.configService.database,
      gateway: this.configService.gateway,
      delivery: this.configService.delivery,
      shutdown: this.configService.shutdown,
      output: this.configService.output,
      logging: this.configService.logging,
      circuitBreaker: this.configService.circuitBreaker,
      retry: this.configService.retry,
      audit: this.configService.audit,
      peerOnboarding: this.configService.peerOnboarding,
    }) as unknown as Record<string, unknown>;

    for (const field of CONFIG_FIELDS) {
      if (field.sensitive) {
        setPath(tree, field.key, REDACTED_CONFIG_VALUE);
      }
    }

    return tree as unknown as GatewayConfigSchema;
  }
}
