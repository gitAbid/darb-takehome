import type { LogContext } from '@/lib/logging/logger';

import type { AppConfig, WebhookSecurityConfig } from './app-config';

const SECRET_BY_CHANNEL = {
  whatsapp: 'whatsappAppSecret',
  email: 'emailSecret',
  transactions: 'transactionsSecret',
} as const satisfies Record<string, keyof WebhookSecurityConfig>;

/**
 * What the running process is configured to do, for the `app.started` event: enough to explain any behaviour from the
 * logs alone, and never a secret — only whether each one is set.
 */
export function summarizeConfig(config: AppConfig): LogContext {
  const { extractor, webhookSecurity, logging } = config;
  return {
    extractor:
      extractor.kind === 'mock'
        ? { kind: 'mock' }
        : {
            kind: 'llm',
            host: new URL(extractor.baseUrl).host,
            model: extractor.model,
            apiKey: extractor.apiKey === null ? 'none' : 'set',
            timeoutMs: extractor.timeoutMs,
            structuredOutput: extractor.structuredOutput,
          },
    // A list, not `{ email: true }`: pino's privacy redaction would censor an `email` key.
    signedChannels: Object.entries(SECRET_BY_CHANNEL).flatMap(([channel, secret]) =>
      webhookSecurity[secret] === null ? [] : [channel],
    ),
    whatsappHandshake: webhookSecurity.whatsappVerifyToken !== null,
    mediaFetchTimeoutMs: config.mediaFetchTimeoutMs,
    logging: { sink: logging.sink, level: logging.level, file: logging.file.enabled ? logging.file.dir : false },
  };
}
