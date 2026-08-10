import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { AxiosError } from 'axios';
import { firstValueFrom } from 'rxjs';
import { KeyIssuanceService } from '../auth/key-issuance.service';
import { PeerUnreachableError } from './peer-onboarding.error';

interface SensorNodeManifestItem {
  capabilities?: string[];
}

interface SensorNodeManifestResponse {
  items?: SensorNodeManifestItem[];
}

export interface OnboardingInput {
  baseUrl: string;
  theirApiKey: string;
  timeoutMs: number;
}

export interface OnboardingResult {
  capabilities: string[];
  issuedApiKey: string;
  apiKeyHash: string;
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private readonly http: HttpService,
    private readonly keyIssuance: KeyIssuanceService,
  ) {}

  async onboard(input: OnboardingInput): Promise<OnboardingResult> {
    const capabilities = await this.validateManifest(input);
    const { apiKey, apiKeyHash } = this.keyIssuance.issue();
    return { capabilities, issuedApiKey: apiKey, apiKeyHash };
  }

  private async validateManifest(input: OnboardingInput): Promise<string[]> {
    const url = `${input.baseUrl.replace(/\/+$/, '')}/sensor-nodes`;

    let response: { data: SensorNodeManifestResponse };
    try {
      response = await firstValueFrom(
        this.http.get<SensorNodeManifestResponse>(url, {
          headers: { 'X-API-Key': input.theirApiKey },
          timeout: input.timeoutMs,
        }),
      );
    } catch (error) {
      const reason = describeFailure(error);
      this.logger.warn(`Peer manifest validation failed for "${input.baseUrl}": ${reason}`);
      throw new PeerUnreachableError(
        `Could not validate the peer's manifest at "${url}": ${reason}`,
        error,
      );
    }

    return extractCapabilities(response.data);
  }
}

function extractCapabilities(body: SensorNodeManifestResponse | undefined): string[] {
  const items = body?.items ?? [];
  const seen = new Set<string>();
  for (const item of items) {
    for (const capability of item.capabilities ?? []) {
      seen.add(capability);
    }
  }
  return [...seen];
}

function describeFailure(error: unknown): string {
  if (error instanceof AxiosError) {
    if (error.code === 'ECONNABORTED') {
      return `timed out`;
    }
    if (error.response) {
      return `peer responded ${error.response.status}`;
    }
    return error.message;
  }
  return error instanceof Error ? error.message : String(error);
}
