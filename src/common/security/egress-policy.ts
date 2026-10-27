import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '../../config/config.service';

export interface EgressPolicyOptions {
  requireHttps: boolean;
  allowPrivateDestinations: boolean;
}

export function isBlockedIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return true;
  }
  const [a, b] = octets;
  if (a === 0) return true;
  if (a === 127) return true;
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true;
  return false;
}

function expandIpv6Groups(address: string): number[] {
  let addr = address;
  const lastColon = addr.lastIndexOf(':');
  const trailingSegment = addr.slice(lastColon + 1);
  if (trailingSegment.includes('.')) {
    const ipv4Octets = trailingSegment.split('.').map(Number);
    if (
      ipv4Octets.length !== 4 ||
      ipv4Octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
    ) {
      return [NaN];
    }
    const high = ((ipv4Octets[0] << 8) | ipv4Octets[1]).toString(16);
    const low = ((ipv4Octets[2] << 8) | ipv4Octets[3]).toString(16);
    addr = `${addr.slice(0, lastColon + 1)}${high}:${low}`;
  }

  if (!addr.includes('::')) {
    const groups = addr.split(':').map((group) => parseInt(group, 16));
    return groups.length === 8 ? groups : [NaN];
  }

  const [head, tail] = addr.split('::');
  const headGroups = head ? head.split(':').map((group) => parseInt(group, 16)) : [];
  const tailGroups = tail ? tail.split(':').map((group) => parseInt(group, 16)) : [];
  const missing = 8 - headGroups.length - tailGroups.length;
  if (missing < 0) {
    return [NaN];
  }
  return [...headGroups, ...new Array<number>(missing).fill(0), ...tailGroups];
}

export function isBlockedIpv6(address: string): boolean {
  const groups = expandIpv6Groups(address);
  if (groups.length !== 8 || groups.some((group) => Number.isNaN(group))) {
    return true;
  }

  if (groups.every((group) => group === 0)) return true;
  if (groups[7] === 1 && groups.slice(0, 7).every((group) => group === 0)) return true;

  const [first] = groups;
  if ((first & 0xfe00) === 0xfc00) return true;
  if ((first & 0xffc0) === 0xfe80) return true;

  const isV4Mapped =
    groups[0] === 0 &&
    groups[1] === 0 &&
    groups[2] === 0 &&
    groups[3] === 0 &&
    groups[4] === 0 &&
    groups[5] === 0xffff;
  if (isV4Mapped) {
    const a = (groups[6] >> 8) & 0xff;
    const b = groups[6] & 0xff;
    const c = (groups[7] >> 8) & 0xff;
    const d = groups[7] & 0xff;
    return isBlockedIpv4(`${a}.${b}.${c}.${d}`);
  }

  return false;
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return isBlockedIpv4(address);
  if (family === 6) return isBlockedIpv6(address);
  return true;
}

export async function assertUrlAllowedWithPolicy(
  rawUrl: string,
  options: EgressPolicyOptions,
): Promise<void> {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw new Error(`"${rawUrl}" is not a valid URL.`);
  }

  const allowedSchemes = options.requireHttps ? ['https:'] : ['https:', 'http:'];
  if (!allowedSchemes.includes(parsed.protocol)) {
    throw new Error(
      `"${rawUrl}" uses scheme "${parsed.protocol}" which is not allowed (allowed: ${allowedSchemes.join(', ')}).`,
    );
  }

  if (options.allowPrivateDestinations) {
    return;
  }

  const { hostname } = parsed;
  const addresses =
    isIP(hostname) !== 0
      ? [hostname]
      : (await lookup(hostname, { all: true })).map((entry) => entry.address);

  if (addresses.length === 0) {
    throw new Error(`Could not resolve hostname "${hostname}" for "${rawUrl}".`);
  }

  for (const address of addresses) {
    if (isBlockedAddress(address)) {
      throw new Error(
        `"${rawUrl}" resolves to "${address}", a private/loopback/link-local/metadata address, which is not allowed.`,
      );
    }
  }
}

@Injectable()
export class EgressPolicyService {
  constructor(private readonly configService: ConfigService) {}

  assertUrlAllowed(rawUrl: string): Promise<void> {
    const { requireHttps, allowPrivateDestinations } = this.configService.egress;
    return assertUrlAllowedWithPolicy(rawUrl, { requireHttps, allowPrivateDestinations });
  }
}
