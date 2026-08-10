export function parseTrustedProxyCidrs(csv: string): string[] {
  return csv
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
}
