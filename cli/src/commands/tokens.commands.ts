import type { Command } from 'commander';
import { resolveClientConfig } from '../config';
import { request } from '../http-client';
import { printMessage, printResult } from '../output';
import { buildPaginationQuery, parsePositiveInt, type PageOptions } from '../pagination';

export function registerTokensCommands(program: Command): void {
  const tokens = program.command('tokens').description('Manage admin-api tokens.');

  const list = tokens
    .command('list')
    .description('List issued admin tokens (never their plaintext value).')
    .option('--page <n>', 'page number', parsePositiveInt)
    .option('--page-size <n>', 'items per page (max 500)', parsePositiveInt)
    .action(async (options: PageOptions) => {
      const client = resolveClientConfig(list.optsWithGlobals());
      printResult(await request(client, 'GET', `/admin/tokens${buildPaginationQuery(options)}`));
    });

  const issue = tokens
    .command('issue')
    .description('Issue a new admin token. Prints the plaintext token — shown once, never again.')
    .option('--label <label>', 'operator-facing hint for this token')
    .action(async (options: { label?: string }) => {
      const client = resolveClientConfig(issue.optsWithGlobals());
      printResult(await request(client, 'POST', '/admin/tokens', { label: options.label }));
    });

  const revoke = tokens
    .command('revoke <id>')
    .description('Revoke an admin token.')
    .action(async (id: string) => {
      const client = resolveClientConfig(revoke.optsWithGlobals());
      await request(client, 'DELETE', `/admin/tokens/${encodeURIComponent(id)}`);
      printMessage(`Token ${id} revoked.`);
    });
}
