import pino, { type Logger as PinoInstance } from 'pino';
import type { LogContext, Logger } from './logger';
import type { LoggingConfig } from './logging-config';
import { buildPinoOptions, buildTransportTargets } from './pino-options';

/** Adapter from our `Logger` contract to pino. The event name is both a field (for queries) and the message. */
export class PinoLogger implements Logger {
  constructor(private readonly instance: PinoInstance) {}

  debug(event: string, context?: LogContext): void {
    this.instance.debug({ ...context, event }, event);
  }

  info(event: string, context?: LogContext): void {
    this.instance.info({ ...context, event }, event);
  }

  warn(event: string, context?: LogContext): void {
    this.instance.warn({ ...context, event }, event);
  }

  error(event: string, context?: LogContext): void {
    this.instance.error({ ...context, event }, event);
  }

  child(bindings: LogContext): Logger {
    return new PinoLogger(this.instance.child(bindings));
  }
}

/** Builds a pino instance whose I/O runs in worker threads, so writes never block a request. */
export function createPinoInstance(config: LoggingConfig): PinoInstance {
  return pino(buildPinoOptions(config), pino.transport({ targets: buildTransportTargets(config) }));
}
