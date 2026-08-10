import { buildPaginationQuery, parsePositiveInt } from './pagination';

describe('parsePositiveInt', () => {
  it('parses a valid positive integer string', () => {
    expect(parsePositiveInt('20')).toBe(20);
  });

  it.each(['0', '-1', 'abc', '1.5', ''])('rejects "%s"', (raw) => {
    expect(() => parsePositiveInt(raw)).toThrow(/Expected a positive integer/);
  });
});

describe('buildPaginationQuery', () => {
  it('returns an empty string when neither flag is set', () => {
    expect(buildPaginationQuery({})).toBe('');
  });

  it('includes only the flags that were set', () => {
    expect(buildPaginationQuery({ page: 2 })).toBe('?page=2');
    expect(buildPaginationQuery({ pageSize: 50 })).toBe('?pageSize=50');
  });

  it('includes both flags together', () => {
    expect(buildPaginationQuery({ page: 2, pageSize: 50 })).toBe('?page=2&pageSize=50');
  });
});
