import { LoggerService } from '@nestjs/common';
import pino, { type Logger as Pino } from 'pino';
import { redactSecrets } from './secret-redactor';

type Level = 'log' | 'error' | 'warn' | 'debug' | 'verbose' | 'fatal';

const LEVEL_TO_PINO: Record<Level, pino.Level> = {
  verbose: 'trace',
  debug: 'debug',
  log: 'info',
  warn: 'warn',
  error: 'error',
  fatal: 'fatal',
};

export class PinoLoggerService implements LoggerService {
  constructor(private readonly pino: Pino = createPinoInstance()) {}

  log(message: unknown, ...optionalParams: unknown[]): void {
    this.write('log', message, optionalParams);
  }

  error(message: unknown, ...optionalParams: unknown[]): void {
    this.write('error', message, optionalParams);
  }

  warn(message: unknown, ...optionalParams: unknown[]): void {
    this.write('warn', message, optionalParams);
  }

  debug(message: unknown, ...optionalParams: unknown[]): void {
    this.write('debug', message, optionalParams);
  }

  verbose(message: unknown, ...optionalParams: unknown[]): void {
    this.write('verbose', message, optionalParams);
  }

  fatal(message: unknown, ...optionalParams: unknown[]): void {
    this.write('fatal', message, optionalParams);
  }

  private write(level: Level, message: unknown, optionalParams: unknown[]): void {
    const params = [...optionalParams];
    const context =
      typeof params[params.length - 1] === 'string' ? (params.pop() as string) : undefined;
    const trace = level === 'error' && typeof params[0] === 'string' ? params[0] : undefined;
    const bindings = params.find(isBindings);

    const record: Record<string, unknown> = {};
    if (bindings) {
      Object.assign(record, bindings);
    }
    if (context) {
      record.context = redactSecrets(context);
    }
    if (trace) {
      record.trace = redactSecrets(trace);
    }

    this.pino[LEVEL_TO_PINO[level]](record, redactSecrets(toMessageString(message)));
  }
}

function isBindings(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Error)
  );
}

function toMessageString(message: unknown): string {
  if (typeof message === 'string') {
    return message;
  }
  if (message instanceof Error) {
    return message.stack ?? message.message;
  }
  try {
    return JSON.stringify(message);
  } catch {
    return String(message);
  }
}

function createPinoInstance(): Pino {
  return pino({
    level: process.env.LOG_LEVEL ?? 'info',
    redact: {
      paths: ['req.headers["x-api-key"]', 'headers["x-api-key"]', 'apiKey', '*.apiKey'],
      censor: '[REDACTED]',
    },
    transport:
      process.env.NODE_ENV === 'production'
        ? undefined
        : {
            target: 'pino-pretty',
            options: { colorize: true, translateTime: 'SYS:standard', singleLine: true },
          },
  });
}

export function createPinoLogger(): PinoLoggerService {
  return new PinoLoggerService();
}
