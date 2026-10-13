import { z } from 'zod';

import type { OpenAiCompatibleSettings } from '@/lib/extraction/llm/chat-completions-client';

/** Which DocumentExtractor runs. The mock is the default so the project runs with no keys (bonus B4). */
export type ExtractorConfig = { kind: 'mock' } | ({ kind: 'llm' } & OpenAiCompatibleSettings);

const extractorEnvSchema = z
  .object({
    EXTRACTOR: z.enum(['mock', 'llm']).default('mock'),
    LLM_BASE_URL: z.string().url().optional(),
    LLM_MODEL: z.string().min(1).optional(),
    LLM_API_KEY: z.string().min(1).optional(),
    LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(30000),
    LLM_TEMPERATURE: z.coerce.number().min(0).max(2).optional(),
    LLM_STRUCTURED_OUTPUT: z.enum(['true', 'false']).default('false'),
  })
  .superRefine((env, context) => {
    if (env.EXTRACTOR !== 'llm') return;
    for (const key of ['LLM_BASE_URL', 'LLM_MODEL'] as const) {
      if (env[key] === undefined)
        context.addIssue({ code: 'custom', path: [key], message: 'required when EXTRACTOR=llm' });
    }
  });

export type ExtractorEnv = z.input<typeof extractorEnvSchema>;

/** Parses the extractor variables; returns the issues instead of throwing so app config reports them together. */
export function parseExtractorConfig(
  env: Readonly<Record<string, string | undefined>>,
): { ok: true; config: ExtractorConfig } | { ok: false; issues: string[] } {
  const parsed = extractorEnvSchema.safeParse(env);
  if (!parsed.success) {
    return { ok: false, issues: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`) };
  }
  const vars = parsed.data;
  if (vars.EXTRACTOR === 'mock') return { ok: true, config: { kind: 'mock' } };
  return {
    ok: true,
    config: {
      kind: 'llm',
      baseUrl: vars.LLM_BASE_URL ?? '',
      model: vars.LLM_MODEL ?? '',
      apiKey: vars.LLM_API_KEY ?? null,
      timeoutMs: vars.LLM_TIMEOUT_MS,
      temperature: vars.LLM_TEMPERATURE ?? null,
      structuredOutput: vars.LLM_STRUCTURED_OUTPUT === 'true',
    },
  };
}
