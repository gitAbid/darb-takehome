import pino from 'pino';
import { ConsoleLogger } from '@/lib/logging/console-logger';
import { createLogger } from '@/lib/logging/create-logger';
import { PinoLogger } from '@/lib/logging/pino-logger';
import { RecordingLogger } from '@/lib/logging/recording-logger';
import { buildConfig, endTransport, MemoryStream } from './helpers';

describe('createLogger', () => {
  it('returns a RecordingLogger for the test sink', () => {
    expect(createLogger(buildConfig({ sink: 'test' }))).toBeInstanceOf(RecordingLogger);
  });

  it('returns a ConsoleLogger for the console sink', () => {
    expect(createLogger(buildConfig({ sink: 'console' }))).toBeInstanceOf(ConsoleLogger);
  });

  it('returns a PinoLogger built by the injected factory for the pino sink', () => {
    const stream = new MemoryStream();
    const createPino = jest.fn(() => pino(stream));
    const config = buildConfig({ sink: 'pino' });

    const logger = createLogger(config, { createPino });
    logger.info('webhook.received');

    expect(logger).toBeInstanceOf(PinoLogger);
    expect(createPino).toHaveBeenCalledWith(config);
    expect(stream.records()[0]).toMatchObject({ event: 'webhook.received' });
  });

  it('builds the real worker-thread pino instance by default', () => {
    const logger = createLogger(buildConfig({ sink: 'pino' }));

    expect(logger).toBeInstanceOf(PinoLogger);
    const instance = (logger as unknown as { instance: object }).instance;
    endTransport(instance);
  });
});
