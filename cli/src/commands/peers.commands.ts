import type { Command } from 'commander';
import { resolveClientConfig } from '../config';
import { request } from '../http-client';
import { printMessage, printResult } from '../output';
import { buildPaginationQuery, parsePositiveInt, type PageOptions } from '../pagination';

interface CreateOptions {
  name: string;
  baseUrl: string;
  theirApiKey: string;
  scope: string[];
  ipAllowlist?: string[];
}

interface UpdateOptions {
  name?: string;
  baseUrl?: string;
  scope?: string[];
  ipAllowlist?: string[];
}

export function registerPeersCommands(program: Command): void {
  const peers = program.command('peers').description('Manage registered Entes Privados.');

  const list = peers
    .command('list')
    .description('List registered peers.')
    .option('--page <n>', 'page number', parsePositiveInt)
    .option('--page-size <n>', 'items per page (max 500)', parsePositiveInt)
    .action(async (options: PageOptions) => {
      const client = resolveClientConfig(list.optsWithGlobals());
      printResult(await request(client, 'GET', `/admin/peers${buildPaginationQuery(options)}`));
    });

  const get = peers
    .command('get <id>')
    .description('Show a single peer.')
    .action(async (id: string) => {
      const client = resolveClientConfig(get.optsWithGlobals());
      printResult(await request(client, 'GET', `/admin/peers/${encodeURIComponent(id)}`));
    });

  const create = peers
    .command('create')
    .description(
      'Register a new peer. Prints the plaintext API key issued to it — shown once, never again.',
    )
    .requiredOption('--name <name>')
    .requiredOption('--base-url <url>', "the peer's own base URL (not admin-api's)")
    .requiredOption('--their-api-key <key>', 'API key the peer handed the operator out of band')
    .requiredOption('--scope <scopes...>', 'plate:write and/or face:write')
    .option('--ip-allowlist <ips...>')
    .action(async (options: CreateOptions) => {
      const client = resolveClientConfig(create.optsWithGlobals());
      printResult(
        await request(client, 'POST', '/admin/peers', {
          name: options.name,
          baseUrl: options.baseUrl,
          theirApiKey: options.theirApiKey,
          scopes: options.scope,
          ipAllowlist: options.ipAllowlist,
        }),
      );
    });

  const update = peers
    .command('update <id>')
    .description('Edit business fields of an existing peer.')
    .option('--name <name>')
    .option('--base-url <url>')
    .option('--scope <scopes...>')
    .option('--ip-allowlist <ips...>')
    .action(async (id: string, options: UpdateOptions) => {
      const client = resolveClientConfig(update.optsWithGlobals());
      printResult(
        await request(client, 'PATCH', `/admin/peers/${encodeURIComponent(id)}`, {
          ...(options.name !== undefined ? { name: options.name } : {}),
          ...(options.baseUrl !== undefined ? { baseUrl: options.baseUrl } : {}),
          ...(options.scope !== undefined ? { scopes: options.scope } : {}),
          ...(options.ipAllowlist !== undefined ? { ipAllowlist: options.ipAllowlist } : {}),
        }),
      );
    });

  const remove = peers
    .command('remove <id>')
    .description('Remove a peer.')
    .action(async (id: string) => {
      const client = resolveClientConfig(remove.optsWithGlobals());
      await request(client, 'DELETE', `/admin/peers/${encodeURIComponent(id)}`);
      printMessage(`Peer ${id} removed.`);
    });

  const rotateKey = peers
    .command('rotate-key <id>')
    .description(
      'Rotate the key the gateway presents to a peer. Prints the new plaintext key — shown once, never again.',
    )
    .action(async (id: string) => {
      const client = resolveClientConfig(rotateKey.optsWithGlobals());
      printResult(
        await request(client, 'POST', `/admin/peers/${encodeURIComponent(id)}/rotate-key`),
      );
    });
}
