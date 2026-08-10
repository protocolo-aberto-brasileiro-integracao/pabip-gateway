import { AdminApiError } from './http-client';

export function printResult(value: unknown): void {
  if (value === undefined) {
    return;
  }
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function printMessage(message: string): void {
  process.stdout.write(`${message}\n`);
}

export function printError(error: unknown): void {
  if (error instanceof AdminApiError) {
    process.stderr.write(
      `admin-api error (${error.status}): ${error.problem.detail ?? error.problem.title}\n`,
    );
    for (const message of error.problem.errors ?? []) {
      process.stderr.write(`  - ${message}\n`);
    }
  } else if (error instanceof Error) {
    process.stderr.write(`${error.message}\n`);
  } else {
    process.stderr.write(`Unexpected error: ${String(error)}\n`);
  }
  process.exitCode = 1;
}
