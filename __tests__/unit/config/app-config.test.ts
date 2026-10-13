import { resolve } from 'node:path';

import { loadAppConfig } from '@/lib/config/app-config';

describe('app config', () => {
  it('applies defaults and resolves directories', () => {
    expect(loadAppConfig({ LOG_SINK: 'test' })).toMatchObject({
      fixturesDir: resolve('fixtures'),
      blobDir: resolve('.storage'),
      mediaFetchTimeoutMs: 3000,
      logging: { sink: 'test' },
    });
  });

  it('fails fast on invalid values, naming the variable', () => {
    expect(() => loadAppConfig({ MEDIA_FETCH_TIMEOUT_MS: '-5' })).toThrow(/MEDIA_FETCH_TIMEOUT_MS/);
  });
});
