import { MS_PER_DAY } from './operation-log.constants';

const PARTITION_NAME_PATTERN = /^operation_log_(\d{4})(\d{2})(\d{2})$/;

export interface PartitionBounds {
  name: string;
  fromIso: string;
  toIso: string;
}

export function partitionBoundsForDate(date: Date): PartitionBounds {
  const from = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const to = new Date(from.getTime() + MS_PER_DAY);
  return {
    name: `operation_log_${formatSuffix(from)}`,
    fromIso: from.toISOString(),
    toIso: to.toISOString(),
  };
}

export function isValidPartitionName(name: string): boolean {
  return PARTITION_NAME_PATTERN.test(name);
}

export function partitionDateFromName(name: string): Date | undefined {
  const match = PARTITION_NAME_PATTERN.exec(name);
  if (!match) {
    return undefined;
  }
  const [, year, month, day] = match;
  return new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
}

function formatSuffix(date: Date): string {
  const year = String(date.getUTCFullYear()).padStart(4, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}${month}${day}`;
}
