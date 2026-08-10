import { ListingCacheService } from './listing-cache.service';
import { LISTING_CACHE_MAX_ENTRIES, LISTING_CACHE_TTL_MS } from './outbound-client.constants';
import type { SensorNodeListing } from '../admin-api/outbound-client.port';

function buildListing(total: number): SensorNodeListing {
  return { items: [], page: 1, pageSize: 20, total, totalPages: 1 };
}

describe('ListingCacheService', () => {
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns undefined on a miss', () => {
    const cache = new ListingCacheService();

    expect(cache.get('peer-1', 1, 20)).toBeUndefined();
  });

  it('returns the cached value for the same (peerId, page, pageSize)', () => {
    const cache = new ListingCacheService();
    const listing = buildListing(10);

    cache.set('peer-1', 1, 20, listing);

    expect(cache.get('peer-1', 1, 20)).toBe(listing);
  });

  it('keeps separate entries per page and per pageSize', () => {
    const cache = new ListingCacheService();
    const page1 = buildListing(1);
    const page2 = buildListing(2);
    const otherPageSize = buildListing(3);

    cache.set('peer-1', 1, 20, page1);
    cache.set('peer-1', 2, 20, page2);
    cache.set('peer-1', 1, 50, otherPageSize);

    expect(cache.get('peer-1', 1, 20)).toBe(page1);
    expect(cache.get('peer-1', 2, 20)).toBe(page2);
    expect(cache.get('peer-1', 1, 50)).toBe(otherPageSize);
  });

  it('keeps separate entries per peer for the same page', () => {
    const cache = new ListingCacheService();
    const peerA = buildListing(1);
    const peerB = buildListing(2);

    cache.set('peer-a', 1, 20, peerA);
    cache.set('peer-b', 1, 20, peerB);

    expect(cache.get('peer-a', 1, 20)).toBe(peerA);
    expect(cache.get('peer-b', 1, 20)).toBe(peerB);
  });

  it('expires an entry once its TTL has elapsed', () => {
    jest.useFakeTimers();
    const cache = new ListingCacheService();
    cache.set('peer-1', 1, 20, buildListing(1));

    jest.advanceTimersByTime(LISTING_CACHE_TTL_MS + 1);

    expect(cache.get('peer-1', 1, 20)).toBeUndefined();
  });

  it('evicts the least-recently-used entry once the cache is over capacity', () => {
    const cache = new ListingCacheService();

    for (let i = 0; i < LISTING_CACHE_MAX_ENTRIES; i += 1) {
      cache.set(`peer-${i}`, 1, 20, buildListing(i));
    }
    cache.set('peer-overflow', 1, 20, buildListing(-1));

    expect(cache.get('peer-0', 1, 20)).toBeUndefined();
    expect(cache.get('peer-overflow', 1, 20)).toEqual(buildListing(-1));
  });

  it('reading an entry protects it from eviction as more entries are added', () => {
    const cache = new ListingCacheService();
    cache.set('peer-keep', 1, 20, buildListing(0));

    for (let i = 0; i < LISTING_CACHE_MAX_ENTRIES; i += 1) {
      cache.get('peer-keep', 1, 20);
      cache.set(`peer-${i}`, 1, 20, buildListing(i));
    }

    expect(cache.get('peer-keep', 1, 20)).toEqual(buildListing(0));
  });
});
