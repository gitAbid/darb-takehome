import { resolve } from 'node:path';

import { loadAppConfig } from '@/lib/config/app-config';
import { summarizeConfig } from '@/lib/config/config-summary';

describe('app config', () => {
  it('applies defaults and resolves directories', () => {
    expect(loadAppConfig({ LOG_SINK: 'test' })).toMatchObject({
      fixturesDir: resolve('fixtures'),
      blobDir: resolve('.storage'),
      mediaFetchTimeoutMs: 3000,
      webhookSecurity: {
        emailSecret: null,
        whatsappAppSecret: null,
        whatsappVerifyToken: null,
        transactionsSecret: null,
      },
      logging: { sink: 'test' },
    });
  });

  it('fails fast on invalid values, naming the variable', () => {
    expect(() => loadAppConfig({ MEDIA_FETCH_TIMEOUT_MS: '-5' })).toThrow(/MEDIA_FETCH_TIMEOUT_MS/);
  });

  it('summarizes the LLM extractor by host and model, saying only whether a key and secrets are set', () => {
    const env = {
      LOG_SINK: 'test',
      LOG_FILE_ENABLED: 'false',
      EXTRACTOR: 'llm',
      LLM_BASE_URL: 'https://api.openai.com/v1',
      LLM_MODEL: 'm',
    };
    const keyed = summarizeConfig(
      loadAppConfig({ ...env, LLM_API_KEY: 'sk-live-123', TRANSACTIONS_WEBHOOK_SECRET: 's' }),
    );
    expect(keyed).toMatchObject({
      extractor: { kind: 'llm', host: 'api.openai.com', model: 'm', apiKey: 'set', structuredOutput: false },
      signedChannels: ['transactions'],
      logging: { file: false },
    });
    expect(JSON.stringify(keyed)).not.toContain('sk-live-123');
    expect(summarizeConfig(loadAppConfig(env)).extractor).toMatchObject({ apiKey: 'none' });
  });
});
