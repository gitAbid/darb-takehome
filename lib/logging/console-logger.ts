import { log } from '@/lib/logger';
import type { LogContext, Logger } from './logger';

type ConsoleSink = typeof log;

/** Adapter over the brief's `lib/logger.ts` console logger (kept unchanged). Useful for local debugging. */
export class ConsoleLogger implements Logger {
  constructor(
    private readonly bindings: LogContext = {},
    private readonly sink: ConsoleSink = log,
  ) {}

  info(event: string, context?: LogContext): void {
    this.sink.info(event, this.merge(context));
  }

  warn(event: string, context?: LogContext): void {
    this.sink.warn(event, this.merge(context));
  }

  error(event: string, context?: LogContext): void {
    this.sink.error(event, this.merge(context));
  }

  child(bindings: LogContext): Logger {
    return new ConsoleLogger(this.merge(bindings), this.sink);
  }

  private merge(context?: LogContext): LogContext {
    return { ...this.bindings, ...context };
  }
}
