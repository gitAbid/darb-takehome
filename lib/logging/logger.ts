/** Structured fields attached to a log event. Values must be serializable; never pass raw file bytes or OCR text. */
export type LogContext = Record<string, unknown>;

/** The only logging contract services depend on. Implementations are chosen in the composition root. */
export interface Logger {
  info(event: string, context?: LogContext): void;
  warn(event: string, context?: LogContext): void;
  error(event: string, context?: LogContext): void;
  child(bindings: LogContext): Logger;
}
