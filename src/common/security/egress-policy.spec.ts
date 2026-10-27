import { assertUrlAllowedWithPolicy, EgressPolicyService, isBlockedAddress } from './egress-policy';

describe('isBlockedAddress', () => {
  it('blocks IPv4 loopback', () => {
    expect(isBlockedAddress('127.0.0.1')).toBe(true);
  });

  it('blocks the IPv4 cloud-metadata address', () => {
    expect(isBlockedAddress('169.254.169.254')).toBe(true);
  });

  it('blocks IPv4 private ranges', () => {
    expect(isBlockedAddress('10.0.0.5')).toBe(true);
    expect(isBlockedAddress('172.16.0.1')).toBe(true);
    expect(isBlockedAddress('172.31.255.255')).toBe(true);
    expect(isBlockedAddress('192.168.1.1')).toBe(true);
  });

  it('does not block an address adjacent to the 172.16/12 range', () => {
    expect(isBlockedAddress('172.32.0.1')).toBe(false);
    expect(isBlockedAddress('172.15.255.255')).toBe(false);
  });

  it('blocks IPv4 unspecified address', () => {
    expect(isBlockedAddress('0.0.0.0')).toBe(true);
  });

  it('allows a normal public IPv4 address', () => {
    expect(isBlockedAddress('93.184.216.34')).toBe(false);
  });

  it('blocks IPv6 loopback and unspecified', () => {
    expect(isBlockedAddress('::1')).toBe(true);
    expect(isBlockedAddress('::')).toBe(true);
  });

  it('blocks IPv6 unique-local and link-local ranges', () => {
    expect(isBlockedAddress('fc00::1')).toBe(true);
    expect(isBlockedAddress('fd12:3456:789a::1')).toBe(true);
    expect(isBlockedAddress('fe80::1')).toBe(true);
  });

  it('blocks an IPv4-mapped IPv6 private address', () => {
    expect(isBlockedAddress('::ffff:10.0.0.1')).toBe(true);
  });

  it('allows a normal public IPv6 address', () => {
    expect(isBlockedAddress('2606:2800:220:1:248:1893:25c8:1946')).toBe(false);
  });

  it('blocks a value that is not a valid IP at all', () => {
    expect(isBlockedAddress('not-an-ip')).toBe(true);
  });
});

describe('assertUrlAllowedWithPolicy', () => {
  const permissive = { requireHttps: false, allowPrivateDestinations: true };

  it('rejects http:// when requireHttps is true', async () => {
    await expect(
      assertUrlAllowedWithPolicy('http://example.com', {
        requireHttps: true,
        allowPrivateDestinations: true,
      }),
    ).rejects.toThrow(/not allowed/);
  });

  it('allows http:// when requireHttps is false', async () => {
    await expect(
      assertUrlAllowedWithPolicy('http://127.0.0.1', permissive),
    ).resolves.toBeUndefined();
  });

  it('rejects a loopback literal IP when allowPrivateDestinations is false', async () => {
    await expect(
      assertUrlAllowedWithPolicy('https://127.0.0.1', {
        requireHttps: true,
        allowPrivateDestinations: false,
      }),
    ).rejects.toThrow(/private\/loopback/);
  });

  it('rejects the cloud-metadata literal IP when allowPrivateDestinations is false', async () => {
    await expect(
      assertUrlAllowedWithPolicy('https://169.254.169.254/latest/meta-data', {
        requireHttps: true,
        allowPrivateDestinations: false,
      }),
    ).rejects.toThrow(/private\/loopback/);
  });

  it('rejects a 10.x literal IP when allowPrivateDestinations is false', async () => {
    await expect(
      assertUrlAllowedWithPolicy('https://10.1.2.3', {
        requireHttps: true,
        allowPrivateDestinations: false,
      }),
    ).rejects.toThrow(/private\/loopback/);
  });

  it('allows a public literal IP when allowPrivateDestinations is false', async () => {
    await expect(
      assertUrlAllowedWithPolicy('https://93.184.216.34', {
        requireHttps: true,
        allowPrivateDestinations: false,
      }),
    ).resolves.toBeUndefined();
  });

  it('skips the resolve/private-range check entirely when allowPrivateDestinations is true', async () => {
    await expect(
      assertUrlAllowedWithPolicy('https://this-host-does-not-resolve.invalid', permissive),
    ).resolves.toBeUndefined();
  });

  it('rejects a malformed URL', async () => {
    await expect(assertUrlAllowedWithPolicy('not a url', permissive)).rejects.toThrow(
      /not a valid URL/,
    );
  });
});

describe('EgressPolicyService', () => {
  it('reads requireHttps/allowPrivateDestinations from ConfigService.egress', async () => {
    const configService = { egress: { requireHttps: true, allowPrivateDestinations: false } };
    const service = new EgressPolicyService(configService as never);

    await expect(service.assertUrlAllowed('https://127.0.0.1')).rejects.toThrow(
      /private\/loopback/,
    );
  });
});
