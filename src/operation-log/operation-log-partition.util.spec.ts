import {
  isValidPartitionName,
  partitionBoundsForDate,
  partitionDateFromName,
} from './operation-log-partition.util';

describe('partitionBoundsForDate', () => {
  it('computes the UTC day bounds and partition name for a date', () => {
    const bounds = partitionBoundsForDate(new Date('2026-08-06T15:42:00Z'));
    expect(bounds).toEqual({
      name: 'operation_log_20260806',
      fromIso: '2026-08-06T00:00:00.000Z',
      toIso: '2026-08-07T00:00:00.000Z',
    });
  });
});

describe('isValidPartitionName', () => {
  it('accepts the exact operation_log_YYYYMMDD shape', () => {
    expect(isValidPartitionName('operation_log_20260806')).toBe(true);
  });

  it.each([
    'operation_log_default',
    'operation_log_2026080',
    'operation_log_202608066',
    'operation_log_2026-08-06',
    '"; DROP TABLE operation_log; --',
  ])('rejects "%s"', (name) => {
    expect(isValidPartitionName(name)).toBe(false);
  });
});

describe('partitionDateFromName', () => {
  it('parses a valid name back into its UTC midnight date', () => {
    expect(partitionDateFromName('operation_log_20260806')).toEqual(
      new Date('2026-08-06T00:00:00.000Z'),
    );
  });

  it('returns undefined for an invalid name', () => {
    expect(partitionDateFromName('operation_log_default')).toBeUndefined();
  });
});
