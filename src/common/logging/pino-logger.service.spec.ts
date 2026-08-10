import { registerSecret, resetRegisteredSecrets } from './secret-redactor';
import { createPinoLogger, PinoLoggerService } from './pino-logger.service';

type FakePinoMethod = jest.Mock<void, [record: Record<string, string>, message: string]>;

function createFakePino(): Record<
  'info' | 'error' | 'warn' | 'debug' | 'trace' | 'fatal',
  FakePinoMethod
> {
  return {
    info: jest.fn<void, [record: Record<string, string>, message: string]>(),
    error: jest.fn<void, [record: Record<string, string>, message: string]>(),
    warn: jest.fn<void, [record: Record<string, string>, message: string]>(),
    debug: jest.fn<void, [record: Record<string, string>, message: string]>(),
    trace: jest.fn<void, [record: Record<string, string>, message: string]>(),
    fatal: jest.fn<void, [record: Record<string, string>, message: string]>(),
  };
}

describe('PinoLoggerService', () => {
  afterEach(() => {
    resetRegisteredSecrets();
  });

  it('maps Nest log levels onto the matching pino level', () => {
    const pino = createFakePino();
    const logger = new PinoLoggerService(pino as never);

    logger.log('booting up', 'Bootstrap');
    logger.warn('slow response', 'HttpAdapter');
    logger.verbose('trace detail', 'Debug');
    logger.debug('debug detail', 'Debug');
    logger.fatal('fatal detail', 'Bootstrap');

    expect(pino.info).toHaveBeenCalledWith({ context: 'Bootstrap' }, 'booting up');
    expect(pino.warn).toHaveBeenCalledWith({ context: 'HttpAdapter' }, 'slow response');
    expect(pino.trace).toHaveBeenCalledWith({ context: 'Debug' }, 'trace detail');
    expect(pino.debug).toHaveBeenCalledWith({ context: 'Debug' }, 'debug detail');
    expect(pino.fatal).toHaveBeenCalledWith({ context: 'Bootstrap' }, 'fatal detail');
  });

  it('treats the second error() argument as the stack trace, per Nest convention', () => {
    const pino = createFakePino();
    const logger = new PinoLoggerService(pino as never);

    logger.error('boom', 'Error: boom\n  at x', 'ProblemDetailsFilter');

    expect(pino.error).toHaveBeenCalledWith(
      { context: 'ProblemDetailsFilter', trace: 'Error: boom\n  at x' },
      'boom',
    );
  });

  it('redacts a registered secret out of the message, context and trace', () => {
    registerSecret('super-secret-token');
    const pino = createFakePino();
    const logger = new PinoLoggerService(pino as never);

    logger.error(
      'request failed with super-secret-token',
      'stack containing super-secret-token',
      'super-secret-token-context',
    );

    const [record, message] = pino.error.mock.calls[0];
    expect(message).toBe('request failed with [REDACTED]');
    expect(record.trace).toBe('stack containing [REDACTED]');
    expect(record.context).toBe('[REDACTED]-context');
  });

  it('logs an Error message payload as its stack', () => {
    const pino = createFakePino();
    const logger = new PinoLoggerService(pino as never);
    const error = new Error('boom');

    logger.log(error);

    const [, message] = pino.info.mock.calls[0];
    expect(message).toBe(error.stack);
  });

  it('serializes a non-string, non-Error message payload as JSON', () => {
    const pino = createFakePino();
    const logger = new PinoLoggerService(pino as never);

    logger.log({ event: 'boot', ok: true });

    const [, message] = pino.info.mock.calls[0];
    expect(message).toBe(JSON.stringify({ event: 'boot', ok: true }));
  });

  it('falls back to String() when the message payload cannot be JSON-stringified', () => {
    const pino = createFakePino();
    const logger = new PinoLoggerService(pino as never);
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    logger.log(circular);

    const [, message] = pino.info.mock.calls[0];
    expect(message).toBe('[object Object]');
  });

  it('merges a plain-object argument as structured bindings, separate from context', () => {
    const pino = createFakePino();
    const logger = new PinoLoggerService(pino as never);

    logger.warn('retrying delivery', { peerId: 'peer-1', batchId: 'batch-1' }, 'OutputSinkService');

    expect(pino.warn).toHaveBeenCalledWith(
      { peerId: 'peer-1', batchId: 'batch-1', context: 'OutputSinkService' },
      'retrying delivery',
    );
  });

  it('builds a working default instance via createPinoLogger()', () => {
    const logger = createPinoLogger();

    expect(logger).toBeInstanceOf(PinoLoggerService);
    expect(() => logger.log('smoke test')).not.toThrow();
  });
});
