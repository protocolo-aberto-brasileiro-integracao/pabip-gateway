import { EventEmitter } from 'node:events';

interface MockSubscriber {
  events: EventEmitter;
  notifications: EventEmitter;
  connect: jest.Mock;
  close: jest.Mock;
  listenTo: jest.Mock;
}

const createdSubscribers: MockSubscriber[] = [];

jest.mock('pg-listen', () => {
  const createPostgresSubscriber = jest.fn(() => {
    const subscriber = {
      events: new EventEmitter(),
      notifications: new EventEmitter(),
      connect: jest.fn().mockResolvedValue(undefined),
      close: jest.fn().mockResolvedValue(undefined),
      listenTo: jest.fn().mockResolvedValue(undefined),
    };

    createdSubscribers.push(subscriber);
    return subscriber;
  });
  return { __esModule: true, default: createPostgresSubscriber };
});

import { DbChangeNotifier } from './db-change-notifier';

describe('DbChangeNotifier', () => {
  beforeEach(() => {
    createdSubscribers.length = 0;
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('connects and subscribes to the given channel on start', async () => {
    const notifier = new DbChangeNotifier({
      channel: 'config_changed',
      connectionString: 'postgresql://x',
      onChange: jest.fn(),
      pollIntervalMs: 1000,
    });

    await notifier.start();

    const [subscriber] = createdSubscribers;
    expect(subscriber.connect).toHaveBeenCalled();
    expect(subscriber.listenTo).toHaveBeenCalledWith('config_changed');
  });

  it('calls onChange when a notification arrives on the channel', async () => {
    const onChange = jest.fn().mockResolvedValue(undefined);
    const notifier = new DbChangeNotifier({
      channel: 'config_changed',
      connectionString: 'postgresql://x',
      onChange,
      pollIntervalMs: 1000,
    });
    await notifier.start();

    createdSubscribers[0].notifications.emit('config_changed');
    await flushMicrotasks();

    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it('calls onChange on every poll tick', async () => {
    const onChange = jest.fn().mockResolvedValue(undefined);
    const notifier = new DbChangeNotifier({
      channel: 'config_changed',
      connectionString: 'postgresql://x',
      onChange,
      pollIntervalMs: 1000,
    });
    await notifier.start();

    jest.advanceTimersByTime(1000);
    await flushMicrotasks();
    jest.advanceTimersByTime(1000);
    await flushMicrotasks();

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('skips an overlapping tick instead of queueing it', async () => {
    let resolveFirst: () => void = () => undefined;
    const onChange = jest
      .fn()
      .mockImplementationOnce(() => new Promise<void>((resolve) => (resolveFirst = resolve)))
      .mockResolvedValue(undefined);

    const notifier = new DbChangeNotifier({
      channel: 'config_changed',
      connectionString: 'postgresql://x',
      onChange,
      pollIntervalMs: 1000,
    });
    await notifier.start();

    jest.advanceTimersByTime(1000);
    await flushMicrotasks();
    jest.advanceTimersByTime(1000);
    await flushMicrotasks();

    expect(onChange).toHaveBeenCalledTimes(1);

    resolveFirst();
    await flushMicrotasks();
    jest.advanceTimersByTime(1000);
    await flushMicrotasks();

    expect(onChange).toHaveBeenCalledTimes(2);
  });

  it('logs instead of throwing when onChange rejects', async () => {
    const onChange = jest.fn().mockRejectedValue(new Error('boom'));
    const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const notifier = new DbChangeNotifier({
      channel: 'config_changed',
      connectionString: 'postgresql://x',
      onChange,
      pollIntervalMs: 1000,
      logger,
    });
    await notifier.start();

    createdSubscribers[0].notifications.emit('config_changed');
    await flushMicrotasks();

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('onChange handler threw'),
      expect.any(String),
    );
  });

  it('logs connection errors and reconnect attempts without throwing', async () => {
    const logger = { debug: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const notifier = new DbChangeNotifier({
      channel: 'config_changed',
      connectionString: 'postgresql://x',
      onChange: jest.fn(),
      pollIntervalMs: 1000,
      logger,
    });
    await notifier.start();

    createdSubscribers[0].events.emit('error', new Error('connection lost'));
    createdSubscribers[0].events.emit('reconnect', 2);

    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining('connection error'),
      expect.any(String),
    );
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('reconnecting (attempt 2)'));
  });

  it('stops polling and closes the subscriber on stop()', async () => {
    const onChange = jest.fn().mockResolvedValue(undefined);
    const notifier = new DbChangeNotifier({
      channel: 'config_changed',
      connectionString: 'postgresql://x',
      onChange,
      pollIntervalMs: 1000,
    });
    await notifier.start();

    await notifier.stop();

    expect(createdSubscribers[0].close).toHaveBeenCalled();

    jest.advanceTimersByTime(5000);
    await flushMicrotasks();
    expect(onChange).not.toHaveBeenCalled();
  });
});

async function flushMicrotasks(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}
