import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import pino from 'pino';
import { createPinoInstance, PinoLogger } from '@/lib/logging/pino-logger';
import { buildPinoOptions, buildTransportTargets } from '@/lib/logging/pino-options';
import { LOG_FILE_NAME } from '@/lib/logging/rotating-file-options';
import { buildConfig, endTransport, MemoryStream, waitFor } from './helpers';

describe('PinoLogger', () => {
  function create() {
    const stream = new MemoryStream();
    return { stream, logger: new PinoLogger(pino(buildPinoOptions(buildConfig()), stream)) };
  }

  it('logs each level with the event as both field and message', () => {
    const { stream, logger } = create();

    logger.info('document.created', { documentId: 1 });
    logger.warn('sender.unknown');
    logger.error('document.failed', { stage: 'extract' });

    expect(stream.records()).toEqual([
      expect.objectContaining({ level: 30, event: 'document.created', msg: 'document.created', documentId: 1 }),
      expect.objectContaining({ level: 40, event: 'sender.unknown', msg: 'sender.unknown' }),
      expect.objectContaining({ level: 50, event: 'document.failed', stage: 'extract' }),
    ]);
  });

  it('does not let context overwrite the event name', () => {
    const { stream, logger } = create();

    logger.info('match.decided', { event: 'spoofed' });

    expect(stream.records()[0].event).toBe('match.decided');
  });

  it('carries child bindings into every record', () => {
    const { stream, logger } = create();

    logger.child({ correlationId: 'c-1' }).child({ documentId: 9 }).info('match.decided');

    expect(stream.records()[0]).toMatchObject({ correlationId: 'c-1', documentId: 9, event: 'match.decided' });
  });
});

describe('pino worker-thread transports', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'darb-logs-'));
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('writes asynchronously to the rotating file through the .mjs transport', async () => {
    const config = buildConfig({ file: { enabled: true, dir, size: '10M', interval: '1d', maxFiles: 2 } });
    const transport = pino.transport({ targets: buildTransportTargets(config).slice(1) });
    const logger = new PinoLogger(pino(buildPinoOptions(config), transport));

    logger.info('document.created', { documentId: 42, phone: '+966551234567' });

    const file = path.join(dir, LOG_FILE_NAME);
    await waitFor(() => fs.existsSync(file) && fs.readFileSync(file, 'utf8').includes('document.created'));
    const written = fs.readFileSync(file, 'utf8');
    expect(written).toContain('"documentId":42');
    expect(written).not.toContain('+966551234567');
    transport.end();
  });

  it('createPinoInstance builds a logger with the configured level and transports', () => {
    const config = buildConfig({
      level: 'warn',
      file: { enabled: true, dir, size: '10M', interval: '1d', maxFiles: 2 },
    });

    const instance = createPinoInstance(config);

    expect(instance.level).toBe('warn');
    expect(instance.isLevelEnabled('info')).toBe(false);
    endTransport(instance);
  });
});
