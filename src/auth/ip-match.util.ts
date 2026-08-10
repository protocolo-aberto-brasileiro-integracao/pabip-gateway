export function normalizeIp(ip: string): string {
  return ip.startsWith('::ffff:') ? ip.slice('::ffff:'.length) : ip;
}

export function matchesAllowlistEntry(ip: string, entry: string): boolean {
  if (!entry.includes('/')) {
    return ip === entry;
  }

  const [rangeIp, prefixRaw] = entry.split('/');
  const ipInt = ipv4ToInt(ip);
  const rangeInt = ipv4ToInt(rangeIp);
  if (ipInt === undefined || rangeInt === undefined || !/^\d+$/.test(prefixRaw)) {
    return false;
  }
  const prefixLength = Number(prefixRaw);
  if (prefixLength > 32) {
    return false;
  }

  const mask = prefixLength === 0 ? 0 : (0xffffffff << (32 - prefixLength)) >>> 0;
  return (ipInt & mask) === (rangeInt & mask);
}

function ipv4ToInt(ip: string): number | undefined {
  const parts = ip.split('.');
  if (parts.length !== 4) {
    return undefined;
  }
  let result = 0;
  for (const part of parts) {
    const octet = Number(part);
    if (!Number.isInteger(octet) || octet < 0 || octet > 255) {
      return undefined;
    }
    result = (result << 8) + octet;
  }
  return result >>> 0;
}

export function isIpAllowed(ip: string, allowlist: readonly string[]): boolean {
  if (allowlist.length === 0) {
    return true;
  }
  const normalized = normalizeIp(ip);
  return allowlist.some((entry) => matchesAllowlistEntry(normalized, entry));
}
