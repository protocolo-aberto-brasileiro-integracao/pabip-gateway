import { Injectable } from '@nestjs/common';
import { registerSecret } from '../common/logging/secret-redactor';
import { generateOpaqueSecret, hashSecret } from './crypto.util';

export const PEER_API_KEY_PREFIX = 'ak_live_';

export interface IssuedPeerApiKey {
  apiKey: string;
  apiKeyHash: string;
}

@Injectable()
export class KeyIssuanceService {
  issue(): IssuedPeerApiKey {
    const apiKey = generateOpaqueSecret(PEER_API_KEY_PREFIX);
    registerSecret(apiKey);
    return { apiKey, apiKeyHash: hashSecret(apiKey) };
  }
}
