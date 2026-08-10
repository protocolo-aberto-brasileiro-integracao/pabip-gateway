import { HttpService } from '@nestjs/axios';
import { Injectable } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { ConfigService } from '../../config/config.service';
import { registerSecret } from '../../common/logging/secret-redactor';
import type { DeliveryBatch, OutputSinkDriver } from '../output-sink.interface';

const ENV_INTERPOLATION_PATTERN = /\$\{([^}]+)\}/g;

const CALLBACK_TIMEOUT_MS = 10_000;

@Injectable()
export class CallbackDriver implements OutputSinkDriver {
  constructor(
    private readonly http: HttpService,
    private readonly configService: ConfigService,
  ) {}

  async deliver(batch: DeliveryBatch, peerId: string, batchType: string): Promise<void> {
    const { url, headers } = this.configService.output.callback;
    if (!url) {
      throw new Error('output.callback.url is not configured; cannot deliver via callback.');
    }

    const resolvedHeaders = resolveHeaders(headers ?? {});

    await firstValueFrom(
      this.http.post(url, batch, {
        headers: { ...resolvedHeaders, 'X-Peer-Id': peerId, 'X-Batch-Type': batchType },
        timeout: CALLBACK_TIMEOUT_MS,
      }),
    );
  }
}

function resolveHeaders(headers: Record<string, string>): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [name, rawValue] of Object.entries(headers)) {
    let interpolated = false;
    const value = rawValue.replace(ENV_INTERPOLATION_PATTERN, (_match, envVarName: string) => {
      const envValue = process.env[envVarName];
      if (envValue === undefined) {
        throw new Error(
          `output.callback.headers["${name}"] references "\${${envVarName}}", but that environment variable is not set.`,
        );
      }
      interpolated = true;
      return envValue;
    });

    if (interpolated) {
      registerSecret(value);
    }
    resolved[name] = value;
  }
  return resolved;
}
