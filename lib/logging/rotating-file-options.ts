import type { Options as RotatingFileStreamOptions } from 'rotating-file-stream';
import type { RotatingFileSettings } from './logging-config';

export const LOG_FILE_NAME = 'app.log';

/** Options handed to the rotating-file transport worker. Plain data so it can cross the worker-thread boundary. */
export interface RotatingFileTransportOptions {
  fileName: string;
  streamOptions: RotatingFileStreamOptions;
}

/** Rotate on size or interval (whichever comes first), gzip rotated files, keep at most `maxFiles`. */
export function buildRotatingFileTransportOptions(settings: RotatingFileSettings): RotatingFileTransportOptions {
  return {
    fileName: LOG_FILE_NAME,
    streamOptions: {
      path: settings.dir,
      size: settings.size,
      interval: settings.interval,
      compress: 'gzip',
      maxFiles: settings.maxFiles,
    },
  };
}
