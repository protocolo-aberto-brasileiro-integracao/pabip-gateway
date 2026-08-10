import { BadRequestException } from '@nestjs/common';
import type { ConfigFieldType } from '../config/config.constants';

export function assertMatchesFieldType(key: string, value: unknown, type: ConfigFieldType): void {
  const ok = (() => {
    switch (type) {
      case 'string':
        return typeof value === 'string';
      case 'number':
        return typeof value === 'number' && Number.isFinite(value);
      case 'boolean':
        return typeof value === 'boolean';
      case 'json':
        return typeof value === 'object' && value !== null;
    }
  })();

  if (!ok) {
    throw new BadRequestException(`"${key}" must be a ${type}, got ${JSON.stringify(value)}.`);
  }
}

export const REDACTED_CONFIG_VALUE = '[REDACTED]';
