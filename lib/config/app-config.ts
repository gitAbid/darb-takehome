import { resolve } from 'node:path';

import { z } from 'zod';

import { loadLoggingConfig, type LoggingConfig, type LoggingEnv } from '@/lib/logging/logging-config';

const appEnvSchema = z.object({
  FIXTURES_DIR: z.string().min(1).default('fixtures'),
  BLOB_DIR: z.string().min(1).default('.storage'),
  MEDIA_FETCH_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
});

export interface AppConfig {
  fixturesDir: string;
  blobDir: string;
  mediaFetchTimeoutMs: number;
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
    logging: loadLoggingConfig(env),
  };
}
