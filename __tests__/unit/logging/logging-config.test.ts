import { LoggingConfigError, loadLoggingConfig } from '@/lib/logging/logging-config';

describe('loadLoggingConfig', () => {
  it('applies development defaults when nothing is set', () => {
    expect(loadLoggingConfig({})).toEqual({
      sink: 'pino',
      level: 'info',
      pretty: true,
      file: { enabled: true, dir: 'logs', size: '10M', interval: '1d', maxFiles: 14 },
    });
  });

  it('turns off pretty output and file logging by default in production', () => {
    const config = loadLoggingConfig({ NODE_ENV: 'production' });

    expect(config.pretty).toBe(false);
    expect(config.file.enabled).toBe(false);
  });

  it('lets LOG_FILE_ENABLED override the production default', () => {
    expect(loadLoggingConfig({ NODE_ENV: 'production', LOG_FILE_ENABLED: 'true' }).file.enabled).toBe(true);
    expect(loadLoggingConfig({ LOG_FILE_ENABLED: 'false' }).file.enabled).toBe(false);
  });

  it('reads every variable', () => {
    const config = loadLoggingConfig({
      LOG_SINK: 'console',
      LOG_LEVEL: 'warn',
      LOG_DIR: '/var/log/darb',
      LOG_ROTATE_SIZE: '512K',
      LOG_ROTATE_INTERVAL: '12h',
      LOG_MAX_FILES: '30',
    });

    expect(config).toMatchObject({
      sink: 'console',
      level: 'warn',
      file: { dir: '/var/log/darb', size: '512K', interval: '12h', maxFiles: 30 },
    });
  });

  it.each([
    ['LOG_SINK', { LOG_SINK: 'syslog' }],
    ['LOG_LEVEL', { LOG_LEVEL: 'verbose' }],
    ['LOG_FILE_ENABLED', { LOG_FILE_ENABLED: 'yes' }],
    ['LOG_ROTATE_SIZE', { LOG_ROTATE_SIZE: '10MB' }],
    ['LOG_ROTATE_INTERVAL', { LOG_ROTATE_INTERVAL: 'daily' }],
    ['LOG_MAX_FILES', { LOG_MAX_FILES: '0' }],
    ['LOG_MAX_FILES', { LOG_MAX_FILES: 'many' }],
    ['LOG_DIR', { LOG_DIR: '' }],
  ])('rejects an invalid %s with a clear error', (variable, env) => {
    expect(() => loadLoggingConfig(env)).toThrow(LoggingConfigError);
    expect(() => loadLoggingConfig(env)).toThrow(variable);
  });

  it('reports every invalid variable at once', () => {
    try {
      loadLoggingConfig({ LOG_SINK: 'syslog', LOG_LEVEL: 'verbose' });
      throw new Error('expected loadLoggingConfig to throw');
    } catch (error) {
      expect(error).toBeInstanceOf(LoggingConfigError);
      expect((error as LoggingConfigError).issues).toHaveLength(2);
      expect((error as LoggingConfigError).name).toBe('LoggingConfigError');
    }
  });
});
