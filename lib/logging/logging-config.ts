import { z } from 'zod';

export const LOG_SINKS = ['pino', 'console', 'test'] as const;
export const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const;

const FILE_SIZE_PATTERN = /^\d+[BKMG]$/;
const INTERVAL_PATTERN = /^\d+[smhdM]$/;

export type LogSink = (typeof LOG_SINKS)[number];
export type LogLevelSetting = (typeof LOG_LEVELS)[number];
export type LoggingEnv = Readonly<Record<string, string | undefined>>;

export interface RotatingFileSettings {
  enabled: boolean;
  dir: string;
  size: string;
  interval: string;
  maxFiles: number;
}

export interface LoggingConfig {
  sink: LogSink;
  level: LogLevelSetting;
  pretty: boolean;
  file: RotatingFileSettings;
}

/** Thrown at startup when LOG_* variables are invalid, so misconfiguration fails fast and loudly. */
export class LoggingConfigError extends Error {
  constructor(readonly issues: string[]) {
    super(`Invalid logging configuration: ${issues.join('; ')}`);
    this.name = 'LoggingConfigError';
  }
}

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

const loggingEnvSchema = z.object({
  NODE_ENV: z.string().optional(),
  LOG_SINK: z.enum(LOG_SINKS).default('pino'),
  LOG_LEVEL: z.enum(LOG_LEVELS).default('info'),
  LOG_FILE_ENABLED: booleanString.optional(),
  LOG_DIR: z.string().min(1).default('logs'),
  LOG_ROTATE_SIZE: z.string().regex(FILE_SIZE_PATTERN, 'expected e.g. 10M, 512K, 1G').default('10M'),
  LOG_ROTATE_INTERVAL: z.string().regex(INTERVAL_PATTERN, 'expected e.g. 1d, 12h, 30m').default('1d'),
  LOG_MAX_FILES: z.coerce.number().int().positive().default(14),
});

/**
 * Parses LOG_* environment variables (docs/ARCHITECTURE.md §8). Outside production, output is pretty-printed and
 * file logging defaults to on; in production it defaults to off because containers/serverless collect stdout.
 */
export function loadLoggingConfig(env: LoggingEnv): LoggingConfig {
  const parsed = loggingEnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new LoggingConfigError(parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`));
  }
  const vars = parsed.data;
  const isProduction = vars.NODE_ENV === 'production';
  return {
    sink: vars.LOG_SINK,
    level: vars.LOG_LEVEL,
    pretty: !isProduction,
    file: {
      enabled: vars.LOG_FILE_ENABLED ?? !isProduction,
      dir: vars.LOG_DIR,
      size: vars.LOG_ROTATE_SIZE,
      interval: vars.LOG_ROTATE_INTERVAL,
      maxFiles: vars.LOG_MAX_FILES,
    },
  };
}
