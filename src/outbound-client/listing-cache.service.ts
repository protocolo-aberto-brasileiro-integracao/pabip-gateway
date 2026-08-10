import { Injectable } from '@nestjs/common';
import type { SensorNodeListing } from '../admin-api/outbound-client.port';
import { LISTING_CACHE_MAX_ENTRIES, LISTING_CACHE_TTL_MS } from './outbound-client.constants';

interface CacheEntry {
  value: SensorNodeListing;
  expiresAt: number;
}

@Injectable()
export class ListingCacheService {
  private readonly store = new Map<string, CacheEntry>();

  get(peerId: string, page: number, pageSize: number): SensorNodeListing | undefined {
    const key = buildKey(peerId, page, pageSize);
    const entry = this.store.get(key);
    if (!entry) {
      return undefined;
    }

    if (entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return undefined;
    }

    this.store.delete(key);
    this.store.set(key, entry);
    return entry.value;
  }

  set(peerId: string, page: number, pageSize: number, value: SensorNodeListing): void {
    const key = buildKey(peerId, page, pageSize);
    this.store.delete(key);
    this.store.set(key, { value, expiresAt: Date.now() + LISTING_CACHE_TTL_MS });

    if (this.store.size > LISTING_CACHE_MAX_ENTRIES) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) {
        this.store.delete(oldestKey);
      }
    }
  }
}

function buildKey(peerId: string, page: number, pageSize: number): string {
  return `${peerId}:${page}:${pageSize}`;
}
