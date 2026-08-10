#!/usr/bin/env node
import { Command } from 'commander';
import { registerClientTokensCommands } from './commands/client-tokens.commands';
import { registerConfigCommands } from './commands/config.commands';
import { registerHealthCommands } from './commands/health.commands';
import { registerPassthroughCommands } from './commands/passthrough.commands';
import { registerPeersCommands } from './commands/peers.commands';
import { registerTokensCommands } from './commands/tokens.commands';
import { printError } from './output';

const program = new Command();

program
  .name('pabip-gatewayctl')
  .description(
    "Headless CLI client for a pabip-gateway instance's admin-api. " +
      "admin-api is reachable only from the gateway operator's private network — " +
      'run this from a host with a route there.',
  )
  .version('0.1.0')
  .option(
    '--admin-url <url>',
    `admin-api base URL (default: $GATEWAY_ADMIN_URL, or http://127.0.0.1:8081)`,
  )
  .option('--token <token>', 'admin token (default: $GATEWAY_ADMIN_TOKEN)')
  .option(
    '--token-file <path>',
    'path to a file containing the admin token (default: $GATEWAY_ADMIN_TOKEN_FILE)',
  );

registerPeersCommands(program);
registerTokensCommands(program);
registerClientTokensCommands(program);
registerConfigCommands(program);
registerHealthCommands(program);
registerPassthroughCommands(program);

program.parseAsync(process.argv).catch((error: unknown) => {
  printError(error);
});
