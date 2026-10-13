import { resolve } from 'node:path';

import { z } from 'zod';

import { loadLoggingConfig, type LoggingConfig, type LoggingEnv } from '@/lib/logging/logging-config';

const appEnvSchema = z.object({
  FIXTURES_DIR: z.string().min(1).default('fixtures'),
  BLOB_DIR: z.string().min(1).default('.storage'),
  MEDIA_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  EMAIL_WEBHOOK_SECRET: z.string().min(1).optional(),
  WHATSAPP_APP_SECRET: z.string().min(1).optional(),
  WHATSAPP_VERIFY_TOKEN: z.string().min(1).optional(),
  TRANSACTIONS_WEBHOOK_SECRET: z.string().min(1).optional(),
});

/** Webhook authentication (bonus B5). A null secret means that endpoint accepts unsigned requests (local dev). */
export interface WebhookSecurityConfig {
  emailSecret: string | null;
  whatsappAppSecret: string | null;
  whatsappVerifyToken: string | null;
  transactionsSecret: string | null;
}

export interface AppConfig {
  fixturesDir: string;
  blobDir: string;
  mediaFetchTimeoutMs: number;
  webhookSecurity: WebhookSecurityConfig;
  logging: LoggingConfig;
}

/** Parses the environment once at startup; invalid configuration fails fast with the offending variables. */
export function loadAppConfig(env: LoggingEnv = process.env): AppConfig {
  const parsed = appEnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid configuration: ${issues.join('; ')}`);
  }
  return {
    fixturesDir: resolve(parsed.data.FIXTURES_DIR),
    blobDir: resolve(parsed.data.BLOB_DIR),
    mediaFetchTimeoutMs: parsed.data.MEDIA_FETCH_TIMEOUT_MS,
    webhookSecurity: {
      emailSecret: parsed.data.EMAIL_WEBHOOK_SECRET ?? null,
      whatsappAppSecret: parsed.data.WHATSAPP_APP_SECRET ?? null,
      whatsappVerifyToken: parsed.data.WHATSAPP_VERIFY_TOKEN ?? null,
      transactionsSecret: parsed.data.TRANSACTIONS_WEBHOOK_SECRET ?? null,
    },
    logging: loadLoggingConfig(env),
  };
}
