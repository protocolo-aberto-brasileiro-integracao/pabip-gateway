import type { Command } from 'commander';
import { resolveClientConfig } from '../config';
import { request } from '../http-client';
import { printMessage, printResult } from '../output';
import { buildPaginationQuery, parsePositiveInt, type PageOptions } from '../pagination';

export function registerClientTokensCommands(program: Command): void {
  const clientTokens = program
    .command('client-tokens')
    .description('Manage /peers/* client tokens (for a frontend or another consuming system).');

  const list = clientTokens
    .command('list')
    .description('List issued client tokens (never their plaintext value).')
    .option('--page <n>', 'page number', parsePositiveInt)
    .option('--page-size <n>', 'items per page (max 500)', parsePositiveInt)
    .action(async (options: PageOptions) => {
      const client = resolveClientConfig(list.optsWithGlobals());
      printResult(
        await request(client, 'GET', `/admin/client-tokens${buildPaginationQuery(options)}`),
      );
    });

  const issue = clientTokens
    .command('issue')
    .description('Issue a new client token. Prints the plaintext token — shown once, never again.')
    .option('--label <label>', 'operator-facing hint for this token')
    .option('--ip-allowlist <ips...>', 'restrict this token to these IPs/CIDR ranges')
    .action(async (options: { label?: string; ipAllowlist?: string[] }) => {
      const client = resolveClientConfig(issue.optsWithGlobals());
      printResult(
        await request(client, 'POST', '/admin/client-tokens', {
          label: options.label,
          ipAllowlist: options.ipAllowlist,
        }),
      );
    });

  const revoke = clientTokens
    .command('revoke <id>')
    .description('Revoke a client token.')
    .action(async (id: string) => {
      const client = resolveClientConfig(revoke.optsWithGlobals());
      await request(client, 'DELETE', `/admin/client-tokens/${encodeURIComponent(id)}`);
      printMessage(`Client token ${id} revoked.`);
    });
}
