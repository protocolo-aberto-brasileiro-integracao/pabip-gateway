import { parseTrustedProxyCidrs } from './trusted-proxy.util';

describe('parseTrustedProxyCidrs', () => {
  it('returns an empty array for an empty string', () => {
    expect(parseTrustedProxyCidrs('')).toEqual([]);
  });

  it('returns an empty array for a string of only whitespace/commas', () => {
    expect(parseTrustedProxyCidrs('  , ,')).toEqual([]);
  });

  it('splits, trims, and drops empty entries from a mixed CSV', () => {
    expect(parseTrustedProxyCidrs(' 10.0.0.0/24, 172.16.0.0/20 ,203.0.113.5')).toEqual([
      '10.0.0.0/24',
      '172.16.0.0/20',
      '203.0.113.5',
    ]);
  });
});
