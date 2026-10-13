import { log } from '@/lib/logger';

import { currentLogContext } from './log-context';
import type { LogContext, Logger } from './logger';

type ConsoleSink = typeof log;
type DebugSink = (message: string, meta?: LogContext) => void;

/** Same output format as the brief's logger, which has no debug level (it is kept byte-identical). */
export const consoleDebug: DebugSink = (message, meta) => console.debug(`[DEBUG] ${message}`, meta || '');

/**
 * Adapter over the brief's `lib/logger.ts` console logger (kept unchanged). Useful for local debugging.
 * `debugSink` is null unless LOG_LEVEL=debug, so debug events cost nothing otherwise.
 */
export class ConsoleLogger implements Logger {
  constructor(
    private readonly bindings: LogContext = {},
    private readonly sink: ConsoleSink = log,
    private readonly debugSink: DebugSink | null = null,
  ) {}

  debug(event: string, context?: LogContext): void {
    this.debugSink?.(event, this.merge(context));
  }

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
    return new ConsoleLogger(this.merge(bindings), this.sink, this.debugSink);
  }

  private merge(context?: LogContext): LogContext {
    return { ...currentLogContext(), ...this.bindings, ...context };
  }
}
