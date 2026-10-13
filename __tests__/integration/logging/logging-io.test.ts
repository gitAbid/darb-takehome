/** Logging against real files and worker threads: async transport, redaction on disk, rotation with gzip. */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import pino from 'pino';
import { createStream, type RotatingFileStream } from 'rotating-file-stream';

import { createLogger } from '@/lib/logging/create-logger';
import { createPinoInstance, PinoLogger } from '@/lib/logging/pino-logger';
import { buildPinoOptions, buildTransportTargets } from '@/lib/logging/pino-options';
import { buildRotatingFileTransportOptions, LOG_FILE_NAME } from '@/lib/logging/rotating-file-options';

import { buildConfig, endTransport, waitFor } from '../../helpers/logging';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'darb-logs-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

it('writes asynchronously through the worker-thread file transport, with personal data redacted on disk', async () => {
  const config = buildConfig({ file: { enabled: true, dir, size: '10M', interval: '1d', maxFiles: 2 } });
  const transport = pino.transport({ targets: buildTransportTargets(config).slice(1) });
  new PinoLogger(pino(buildPinoOptions(config), transport)).info('document.created', {
    documentId: 42,
    phone: '+966551234567',
  });
  const file = path.join(dir, LOG_FILE_NAME);
  await waitFor(() => fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes('document.created'));
  expect(fs.readFileSync(file, 'utf8')).toContain('"documentId":42');
  expect(fs.readFileSync(file, 'utf8')).not.toContain('+966551234567');
  transport.end();
});

it('rotates by size into gzip files and keeps at most maxFiles', async () => {
  const { fileName, streamOptions } = buildRotatingFileTransportOptions({
    enabled: true,
    dir,
    size: '1K',
    interval: '1d',
    maxFiles: 2,
  });
  const stream = createStream(fileName, streamOptions);
  const writeAndRotate = (target: RotatingFileStream) =>
    new Promise<void>((resolve) => {
      target.once('rotated', () => resolve());
      target.write(`${'x'.repeat(1100)}\n`);
    });
  for (let i = 0; i < 4; i += 1) await writeAndRotate(stream);
  await new Promise<void>((resolve) => stream.end(resolve));
  const rotated = fs.readdirSync(dir).filter((name) => name.endsWith('.gz'));
  expect(rotated.length).toBeGreaterThan(0);
  expect(rotated.length).toBeLessThanOrEqual(2);
  expect([...fs.readFileSync(path.join(dir, rotated[0])).subarray(0, 2)]).toEqual([0x1f, 0x8b]);
});

it('builds the real worker-thread pino logger by default, honouring the configured level', () => {
  const config = buildConfig({ level: 'warn', file: { enabled: true, dir, size: '10M', interval: '1d', maxFiles: 2 } });
  const instance = createPinoInstance(config);
  expect(instance.isLevelEnabled('info')).toBe(false);
  endTransport(instance);
  const logger = createLogger(buildConfig());
  expect(logger).toBeInstanceOf(PinoLogger);
  endTransport((logger as unknown as { instance: object }).instance);
});
