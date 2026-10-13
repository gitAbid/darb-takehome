import type { Logger as PinoInstance } from 'pino';
import { ConsoleLogger } from './console-logger';
import type { Logger } from './logger';
import type { LoggingConfig } from './logging-config';
import { createPinoInstance, PinoLogger } from './pino-logger';
import { RecordingLogger } from './recording-logger';

export interface LoggerFactoryDeps {
  createPino?: (config: LoggingConfig) => PinoInstance;
}

/** Picks the `Logger` implementation for the configured sink. The only place that knows the concrete classes. */
export function createLogger(config: LoggingConfig, deps: LoggerFactoryDeps = {}): Logger {
  switch (config.sink) {
    case 'test':
      return new RecordingLogger();
    case 'console':
      return new ConsoleLogger();
    case 'pino':
      return new PinoLogger((deps.createPino ?? createPinoInstance)(config));
  }
}
