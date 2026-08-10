export function parsePositiveInt(raw: string): number {
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`Expected a positive integer, got "${raw}".`);
  }
  return value;
}

export interface PageOptions {
  page?: number;
  pageSize?: number;
}

export function buildPaginationQuery(options: PageOptions): string {
  const params = new URLSearchParams();
  if (options.page !== undefined) {
    params.set('page', String(options.page));
  }
  if (options.pageSize !== undefined) {
    params.set('pageSize', String(options.pageSize));
  }
  const query = params.toString();
  return query.length > 0 ? `?${query}` : '';
}
