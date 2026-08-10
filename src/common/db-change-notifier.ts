import createPostgresSubscriber, { type Subscriber } from 'pg-listen';

export interface DbChangeNotifierLogger {
  debug(message: string): void;
  warn(message: string): void;
  error(message: string, trace?: string): void;
}

export interface DbChangeNotifierOptions {
  channel: string;
  connectionString: string;
  onChange: () => void | Promise<void>;
  pollIntervalMs: number;
  logger?: DbChangeNotifierLogger;
}

export class DbChangeNotifier {
  private readonly options: DbChangeNotifierOptions;
  private subscriber?: Subscriber;
  private pollHandle?: ReturnType<typeof setInterval>;
  private running = false;

  constructor(options: DbChangeNotifierOptions) {
    this.options = options;
  }

  async start(): Promise<void> {
    const { channel, connectionString, logger } = this.options;

    this.subscriber = createPostgresSubscriber({ connectionString });
    this.subscriber.notifications.on(channel, () => {
      void this.runOnChange();
    });
    this.subscriber.events.on('error', (error) => {
      logger?.error(`db-change-notifier (${channel}): connection error`, error.stack);
    });
    this.subscriber.events.on('reconnect', (attempt) => {
      logger?.warn(`db-change-notifier (${channel}): reconnecting (attempt ${attempt})`);
    });

    await this.subscriber.connect();
    await this.subscriber.listenTo(channel);

    this.pollHandle = setInterval(() => {
      void this.runOnChange();
    }, this.options.pollIntervalMs);
    this.pollHandle.unref();
  }

  async stop(): Promise<void> {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = undefined;
    }
    await this.subscriber?.close();
    this.subscriber = undefined;
  }

  private async runOnChange(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    try {
      await this.options.onChange();
    } catch (error) {
      this.options.logger?.error(
        `db-change-notifier (${this.options.channel}): onChange handler threw`,
        error instanceof Error ? error.stack : String(error),
      );
    } finally {
      this.running = false;
    }
  }
}
