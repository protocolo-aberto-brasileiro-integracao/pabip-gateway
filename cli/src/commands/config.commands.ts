import type { Command } from 'commander';
import { resolveClientConfig } from '../config';
import { request } from '../http-client';
import { printResult } from '../output';

export function registerConfigCommands(program: Command): void {
  const config = program
    .command('config')
    .description('Read/write the reconciled gateway_config tree.');

  const get = config
    .command('get')
    .description('Print the current, redacted config tree.')
    .action(async () => {
      const client = resolveClientConfig(get.optsWithGlobals());
      printResult(await request(client, 'GET', '/admin/config'));
    });

  const set = config
    .command('set <entries...>')
    .description(
      'Set one or more apiWritable config keys, e.g. "delivery.maxAttempts=5" "output.type=callback".',
    )
    .action(async (entries: string[]) => {
      const client = resolveClientConfig(set.optsWithGlobals());
      const values = Object.fromEntries(entries.map(parseEntry));
      printResult(await request(client, 'PATCH', '/admin/config', { values }));
    });
}

export function parseEntry(entry: string): [string, unknown] {
  const separatorIndex = entry.indexOf('=');
  if (separatorIndex === -1) {
    throw new Error(`Expected "key=value", got "${entry}".`);
  }
  const key = entry.slice(0, separatorIndex);
  const rawValue = entry.slice(separatorIndex + 1);
  try {
    return [key, JSON.parse(rawValue)];
  } catch {
    return [key, rawValue];
  }
}
