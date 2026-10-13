import path from 'node:path';
import pino, { type LoggerOptions, type TransportTargetOptions } from 'pino';
import type { LoggingConfig } from './logging-config';
import { buildRotatingFileTransportOptions } from './rotating-file-options';

export const REDACT_CENSOR = '[REDACTED]';
export const REDACT_PATHS = [
  'contentBase64',
  'rawText',
  'phone',
  'email',
  '*.contentBase64',
  '*.rawText',
  '*.phone',
  '*.email',
];
export const STDOUT_FD = 1;
export const DEFAULT_ROTATING_FILE_TRANSPORT = path.join(process.cwd(), 'lib/logging/transports/rotating-file.mjs');

/** Logger options. `redact` is the safety net behind the explicit masking done by `redact.ts`. */
export function buildPinoOptions(config: LoggingConfig): LoggerOptions {
  return {
    level: config.level,
    redact: { paths: REDACT_PATHS, censor: REDACT_CENSOR },
    timestamp: pino.stdTimeFunctions.isoTime,
  };
}

/** Worker-thread transport targets: stdout always, plus the rotating file when enabled. */
export function buildTransportTargets(
  config: LoggingConfig,
  rotatingFileTransport: string = DEFAULT_ROTATING_FILE_TRANSPORT,
): TransportTargetOptions[] {
  const targets = [buildStdoutTarget(config)];
  if (config.file.enabled) {
    targets.push({
      target: rotatingFileTransport,
      level: config.level,
      options: buildRotatingFileTransportOptions(config.file),
    });
  }
  return targets;
}

function buildStdoutTarget(config: LoggingConfig): TransportTargetOptions {
  if (config.pretty) {
    return { target: 'pino-pretty', level: config.level, options: { colorize: true, destination: STDOUT_FD } };
  }
  return { target: 'pino/file', level: config.level, options: { destination: STDOUT_FD } };
}
