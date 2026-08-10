import { hashSecret } from './crypto.util';
import { KeyIssuanceService, PEER_API_KEY_PREFIX } from './key-issuance.service';

describe('KeyIssuanceService', () => {
  it('issues a key with the peer API key prefix and its own hash', () => {
    const service = new KeyIssuanceService();

    const { apiKey, apiKeyHash } = service.issue();

    expect(apiKey.startsWith(PEER_API_KEY_PREFIX)).toBe(true);
    expect(apiKeyHash).toBe(hashSecret(apiKey));
  });

  it('never issues the same key twice', () => {
    const service = new KeyIssuanceService();
    const first = service.issue();
    const second = service.issue();
    expect(first.apiKey).not.toBe(second.apiKey);
  });
});
