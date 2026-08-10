import type { Command } from 'commander';
import { resolveBaseUrl } from '../config';
import { AdminApiError, request } from '../http-client';
import { printResult } from '../output';

export function registerHealthCommands(program: Command): void {
  const health = program.command('health').description('Query liveness/readiness probes.');

  const check = health
    .command('check')
    .description('Print /healthz and /readyz status; exits non-zero if either is unhealthy.')
    .action(async () => {
      const baseUrl = resolveBaseUrl(check.optsWithGlobals());
      const [liveness, readiness] = await Promise.all([
        probe(baseUrl, '/healthz'),
        probe(baseUrl, '/readyz'),
      ]);
      printResult({ healthz: liveness, readyz: readiness });
      if (liveness.status !== 'ok' || readiness.status !== 'ok') {
        process.exitCode = 1;
      }
    });
}

interface ProbeResult {
  status: 'ok' | 'unavailable';
  detail?: string;
}

async function probe(baseUrl: string, path: string): Promise<ProbeResult> {
  try {
    await request({ baseUrl, token: '' }, 'GET', path);
    return { status: 'ok' };
  } catch (error) {
    if (error instanceof AdminApiError) {
      return { status: 'unavailable', detail: error.problem.detail ?? error.problem.title };
    }
    return {
      status: 'unavailable',
      detail: error instanceof Error ? error.message : String(error),
    };
  }
}
