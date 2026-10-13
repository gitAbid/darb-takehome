/** Logging contract: configuration, redaction, error serialization and the Logger implementations (ARCHITECTURE §7–§8). */
import pino from 'pino';

import { ConsoleLogger } from '@/lib/logging/console-logger';
import { createLogger } from '@/lib/logging/create-logger';
import { LogEvents } from '@/lib/logging/log-events';
import { LoggingConfigError, loadLoggingConfig } from '@/lib/logging/logging-config';
import { PinoLogger } from '@/lib/logging/pino-logger';
import {
  buildPinoOptions,
  buildTransportTargets,
  DEFAULT_ROTATING_FILE_TRANSPORT,
  REDACT_CENSOR,
} from '@/lib/logging/pino-options';
import { RecordingLogger } from '@/lib/logging/recording-logger';
import { maskEmail, maskPhone } from '@/lib/logging/redact';
import { serializeError } from '@/lib/logging/serialize-error';

import { buildConfig, MemoryStream } from '../../helpers/logging';

describe('loadLoggingConfig', () => {
  it('defaults to pretty console + rotating file in development and plain stdout in production', () => {
    expect(loadLoggingConfig({})).toEqual({
      sink: 'pino',
      level: 'info',
      pretty: true,
      file: { enabled: true, dir: 'logs', size: '10M', interval: '1d', maxFiles: 14 },
    });
    expect(loadLoggingConfig({ NODE_ENV: 'production' })).toMatchObject({ pretty: false, file: { enabled: false } });
    expect(loadLoggingConfig({ NODE_ENV: 'production', LOG_FILE_ENABLED: 'true' }).file.enabled).toBe(true);
    expect(
      loadLoggingConfig({
        LOG_SINK: 'console',
        LOG_LEVEL: 'warn',
        LOG_DIR: '/var/log/darb',
        LOG_ROTATE_SIZE: '512K',
        LOG_ROTATE_INTERVAL: '12h',
        LOG_MAX_FILES: '30',
      }),
    ).toMatchObject({
      sink: 'console',
      level: 'warn',
      file: { dir: '/var/log/darb', size: '512K', interval: '12h', maxFiles: 30 },
    });
  });

  it('fails fast on invalid variables, naming each one', () => {
    const invalid = [
      { LOG_SINK: 'syslog' },
      { LOG_LEVEL: 'verbose' },
      { LOG_FILE_ENABLED: 'yes' },
      { LOG_ROTATE_SIZE: '10MB' },
      { LOG_ROTATE_INTERVAL: 'daily' },
      { LOG_MAX_FILES: '0' },
      { LOG_DIR: '' },
    ];
    for (const env of invalid) expect(() => loadLoggingConfig(env)).toThrow(Object.keys(env)[0]);
    try {
      loadLoggingConfig({ LOG_SINK: 'syslog', LOG_LEVEL: 'verbose' });
    } catch (error) {
      expect(error).toBeInstanceOf(LoggingConfigError);
      expect((error as LoggingConfigError).issues).toHaveLength(2);
    }
  });
});

describe('privacy helpers', () => {
  it('masks phones and emails down to their edges, and fully masks anything malformed', () => {
    expect(maskPhone('+966551234567')).toBe('+9665•••••567');
    expect(maskPhone('966551234567')).toBe('96655••••567');
    expect(maskEmail('fleet@najd-logistics.example')).toBe('f•••@najd-logistics.example');
    for (const phone of ['', 'not-a-phone', '+966 55 123 4567', '+9665512345678901234'])
      expect(maskPhone(phone)).toBe('•••');
    for (const email of ['', 'no-at-sign', '@domain.example', 'local@']) expect(maskEmail(email)).toBe('•••');
  });

  it('serializes errors to {name, message, stack} and describes non-errors without throwing', () => {
    const error = new TypeError('bad input');
    expect(serializeError(error)).toEqual({ name: 'TypeError', message: 'bad input', stack: error.stack });
    expect(serializeError('boom')).toEqual({ name: 'NonErrorThrown', message: 'boom' });
    expect(serializeError(undefined)).toEqual({ name: 'NonErrorThrown', message: 'undefined' });
    expect(serializeError({ code: 'E1' })).toEqual({ name: 'NonErrorThrown', message: '{"code":"E1"}' });
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(serializeError(circular)).toEqual({ name: 'NonErrorThrown', message: '[object Object]' });
  });
});

describe('Logger implementations', () => {
  it('ConsoleLogger forwards levels to the brief logger, merging child bindings under call context', () => {
    const sink = { info: jest.fn(), warn: jest.fn(), error: jest.fn() };
    const child = new ConsoleLogger({ service: 'ingestion' }, sink).child({ correlationId: 'c-1' });
    child.info(LogEvents.MatchDecided, { correlationId: 'override' });
    child.warn(LogEvents.SenderUnknown);
    child.error(LogEvents.DocumentFailed, { stage: 'extract' });
    expect(sink.info).toHaveBeenCalledWith('match.decided', { service: 'ingestion', correlationId: 'override' });
    expect(sink.warn).toHaveBeenCalledWith('sender.unknown', { service: 'ingestion', correlationId: 'c-1' });
    expect(sink.error).toHaveBeenCalledWith('document.failed', expect.objectContaining({ stage: 'extract' }));
    const spy = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    new ConsoleLogger().info(LogEvents.WebhookReceived);
    expect(spy).toHaveBeenCalledWith('[INFO] webhook.received', {});
    spy.mockRestore();
  });

  it('RecordingLogger records every entry in order, shared with children, and finds by event', () => {
    const root = new RecordingLogger();
    root.info(LogEvents.DocumentCreated, { documentId: 1 });
    root.warn(LogEvents.SenderUnknown);
    root.child({ correlationId: 'c-1' }).error(LogEvents.DocumentFailed, { stage: 'media' });
    expect(root.entries).toEqual([
      { level: 'info', event: 'document.created', context: { documentId: 1 } },
      { level: 'warn', event: 'sender.unknown', context: {} },
      { level: 'error', event: 'document.failed', context: { correlationId: 'c-1', stage: 'media' } },
    ]);
    expect(root.find(LogEvents.ReviewConflict)).toEqual([]);
  });

  it('PinoLogger writes the event as field and message, keeps child bindings, and cannot be spoofed', () => {
    const stream = new MemoryStream();
    const logger = new PinoLogger(pino(buildPinoOptions(buildConfig()), stream)).child({ correlationId: 'c-1' });
    logger.info(LogEvents.MatchDecided, { event: 'spoofed', documentId: 9 });
    logger.warn(LogEvents.SenderUnknown);
    logger.error(LogEvents.DocumentFailed);
    expect(stream.records()).toEqual([
      expect.objectContaining({ level: 30, event: 'match.decided', msg: 'match.decided', correlationId: 'c-1' }),
      expect.objectContaining({ level: 40, event: 'sender.unknown' }),
      expect.objectContaining({ level: 50, event: 'document.failed' }),
    ]);
  });

  it('pino redacts personal fields at the top level and one level deep, at the configured level', () => {
    const stream = new MemoryStream();
    const logger = pino(buildPinoOptions(buildConfig({ level: 'warn' })), stream);
    logger.info('dropped');
    logger.warn({ phone: '+966551234567', rawText: 'text', nested: { contentBase64: 'AAAA', email: 'x@y.z' } });
    const [record] = stream.records();
    expect(stream.records()).toHaveLength(1);
    expect(record).toMatchObject({ phone: REDACT_CENSOR, rawText: REDACT_CENSOR });
    expect(record.nested).toEqual({ contentBase64: REDACT_CENSOR, email: REDACT_CENSOR });
    expect(String(record.time)).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('routes output to stdout (pretty in development) plus a gzip-rotating file when enabled', () => {
    expect(buildTransportTargets(buildConfig())).toEqual([
      { target: 'pino/file', level: 'info', options: { destination: 1 } },
    ]);
    // An absolute path, so pino never resolves a bare name from the (virtual) frames of the Next dev bundle.
    expect(buildTransportTargets(buildConfig({ pretty: true }))[0].target).toBe(require.resolve('pino-pretty'));
    const file = { enabled: true, dir: '/tmp/logs', size: '5M', interval: '12h', maxFiles: 3 };
    expect(buildTransportTargets(buildConfig({ file }))[1]).toEqual({
      target: DEFAULT_ROTATING_FILE_TRANSPORT,
      level: 'info',
      options: {
        fileName: 'app.log',
        streamOptions: { path: '/tmp/logs', size: '5M', interval: '12h', compress: 'gzip', maxFiles: 3 },
      },
    });
  });

  it('createLogger picks the implementation for the configured sink', () => {
    expect(createLogger(buildConfig({ sink: 'test' }))).toBeInstanceOf(RecordingLogger);
    expect(createLogger(buildConfig({ sink: 'console' }))).toBeInstanceOf(ConsoleLogger);
    const stream = new MemoryStream();
    const logger = createLogger(buildConfig(), { createPino: () => pino(stream) });
    logger.info(LogEvents.WebhookReceived);
    expect(logger).toBeInstanceOf(PinoLogger);
    expect(stream.records()[0]).toMatchObject({ event: 'webhook.received' });
  });
});
