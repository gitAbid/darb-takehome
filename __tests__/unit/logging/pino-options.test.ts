import pino from 'pino';
import {
  buildPinoOptions,
  buildTransportTargets,
  DEFAULT_ROTATING_FILE_TRANSPORT,
  REDACT_CENSOR,
} from '@/lib/logging/pino-options';
import { buildConfig, MemoryStream } from './helpers';

describe('buildTransportTargets', () => {
  it('writes JSON to stdout when not pretty and file logging is off', () => {
    expect(buildTransportTargets(buildConfig())).toEqual([
      { target: 'pino/file', level: 'info', options: { destination: 1 } },
    ]);
  });

  it('uses pino-pretty when pretty output is configured', () => {
    const [stdout] = buildTransportTargets(buildConfig({ pretty: true }));

    expect(stdout).toEqual({ target: 'pino-pretty', level: 'info', options: { colorize: true, destination: 1 } });
  });

  it('adds the rotating file transport with rotation and gzip options when enabled', () => {
    const config = buildConfig({
      level: 'warn',
      file: { enabled: true, dir: '/tmp/logs', size: '5M', interval: '12h', maxFiles: 3 },
    });

    const targets = buildTransportTargets(config, '/custom/transport.mjs');

    expect(targets).toHaveLength(2);
    expect(targets[1]).toEqual({
      target: '/custom/transport.mjs',
      level: 'warn',
      options: {
        fileName: 'app.log',
        streamOptions: { path: '/tmp/logs', size: '5M', interval: '12h', compress: 'gzip', maxFiles: 3 },
      },
    });
  });

  it('points at the worker transport file by default', () => {
    const targets = buildTransportTargets(buildConfig({ file: { ...buildConfig().file, enabled: true } }));

    expect(targets[1].target).toBe(DEFAULT_ROTATING_FILE_TRANSPORT);
    expect(DEFAULT_ROTATING_FILE_TRANSPORT).toMatch(/lib\/logging\/transports\/rotating-file\.mjs$/);
  });
});

describe('buildPinoOptions', () => {
  it('redacts sensitive fields at the top level and one level deep', () => {
    const stream = new MemoryStream();
    const logger = pino(buildPinoOptions(buildConfig()), stream);

    logger.info({ phone: '+966551234567', rawText: 'receipt text', nested: { contentBase64: 'AAAA', email: 'x@y.z' } });

    const [record] = stream.records();
    expect(record.phone).toBe(REDACT_CENSOR);
    expect(record.rawText).toBe(REDACT_CENSOR);
    expect(record.nested).toEqual({ contentBase64: REDACT_CENSOR, email: REDACT_CENSOR });
    expect(stream.lines[0]).not.toContain('+966551234567');
  });

  it('respects the configured level and uses ISO timestamps', () => {
    const stream = new MemoryStream();
    const logger = pino(buildPinoOptions(buildConfig({ level: 'warn' })), stream);

    logger.info('dropped');
    logger.warn('kept');

    const records = stream.records();
    expect(records).toHaveLength(1);
    expect(records[0].msg).toBe('kept');
    expect(String(records[0].time)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
