import { Writable } from 'node:stream';
import pino from 'pino';
import type { LoggingConfig } from '@/lib/logging/logging-config';

export function buildConfig(overrides: Partial<LoggingConfig> = {}): LoggingConfig {
  return {
    sink: 'pino',
    level: 'info',
    pretty: false,
    file: { enabled: false, dir: 'logs', size: '10M', interval: '1d', maxFiles: 14 },
    ...overrides,
  };
}

/** A writable that collects pino's JSON lines in memory. */
export class MemoryStream extends Writable {
  readonly lines: string[] = [];

  _write(chunk: Buffer, _encoding: BufferEncoding, callback: () => void): void {
    this.lines.push(...chunk.toString().split('\n').filter(Boolean));
    callback();
  }

  records(): Record<string, unknown>[] {
    return this.lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  }
}

export async function waitFor(condition: () => boolean, timeoutMs = 5000): Promise<void> {
  const started = Date.now();
  while (!condition()) {
    if (Date.now() - started > timeoutMs) throw new Error('waitFor timed out');
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
}

/** Closes the worker-thread transport behind a pino instance so Jest exits cleanly. */
export function endTransport(instance: object): void {
  const streams = instance as Record<symbol, { end(): void }>;
  streams[pino.symbols.streamSym].end();
}
