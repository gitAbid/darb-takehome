/** Structured fields attached to a log event. Values must be serializable; never pass raw file bytes or OCR text. */
export type LogContext = Record<string, unknown>;

/**
 * The only logging contract services depend on. Implementations are chosen in the composition root.
 * `debug` is for per-stage detail (fields read, candidates scored, provider timings) and is off unless LOG_LEVEL=debug.
 */
export interface Logger {
  debug(event: string, context?: LogContext): void;
  info(event: string, context?: LogContext): void;
  warn(event: string, context?: LogContext): void;
  error(event: string, context?: LogContext): void;
  child(bindings: LogContext): Logger;
}
