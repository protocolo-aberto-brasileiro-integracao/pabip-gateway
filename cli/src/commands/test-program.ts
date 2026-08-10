import { Command } from 'commander';

export function buildTestProgram(): Command {
  const program = new Command();
  program
    .exitOverride()
    .option('--admin-url <url>')
    .option('--token <token>')
    .option('--token-file <path>');
  return program;
}

export async function run(program: Command, args: string[]): Promise<void> {
  await program.parseAsync(['node', 'pabip-gatewayctl', ...args]);
}
