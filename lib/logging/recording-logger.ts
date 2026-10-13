import type { LogContext, Logger } from './logger';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  event: string;
  context: LogContext;
}

/** In-memory logger for tests. Children share the parent's entry list so assertions see every event. */
export class RecordingLogger implements Logger {
  constructor(
    readonly entries: LogEntry[] = [],
    private readonly bindings: LogContext = {},
  ) {}

  info(event: string, context?: LogContext): void {
    this.record('info', event, context);
  }

  warn(event: string, context?: LogContext): void {
    this.record('warn', event, context);
  }

  error(event: string, context?: LogContext): void {
    this.record('error', event, context);
  }

  child(bindings: LogContext): Logger {
    return new RecordingLogger(this.entries, { ...this.bindings, ...bindings });
  }

  /** Entries with the given event name, in the order they were logged. */
  find(event: string): LogEntry[] {
    return this.entries.filter((entry) => entry.event === event);
  }

  private record(level: LogLevel, event: string, context?: LogContext): void {
    this.entries.push({ level, event, context: { ...this.bindings, ...context } });
  }
}
