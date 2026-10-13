import { LogEvents } from '@/lib/logging/log-events';
import type { Logger } from '@/lib/logging/logger';

import { ExtractionFailedError } from '../extraction-errors';

import type { ChatMessage, JsonSchema } from './extraction-prompt';

export interface CompletionRequest {
  messages: ChatMessage[];
  jsonSchema: JsonSchema;
}

/** One chat completion, returning the reply text. The seam that makes the extractor provider-agnostic. */
export interface LlmClient {
  complete(request: CompletionRequest): Promise<string>;
}

/** How much of a provider's error body to log: enough for "invalid model" / "bad key", never a whole echo. */
const ERROR_DETAIL_CHARS = 300;

interface CompletionBody {
  choices?: { message?: { content?: unknown } }[];
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface OpenAiCompatibleSettings {
  baseUrl: string;
  model: string;
  /** null for keyless local servers (Ollama). */
  apiKey: string | null;
  timeoutMs: number;
  /** Omitted unless set: some providers reject values (Claude 4.7+ answers 400 below 1 on this route). */
  temperature: number | null;
  /** Also send `response_format: json_schema` (strict) — only for providers that support it. */
  structuredOutput: boolean;
}

/**
 * `POST {baseUrl}/chat/completions` — the OpenAI wire format, also served by Anthropic, Gemini, OpenRouter, Ollama and
 * others, so switching provider is a base URL, model and key change. Plain fetch: no SDK, no vendor lock-in.
 */
export class OpenAiCompatibleClient implements LlmClient {
  constructor(
    private readonly settings: OpenAiCompatibleSettings,
    private readonly logger: Logger,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async complete(request: CompletionRequest): Promise<string> {
    const started = performance.now();
    const response = await this.send(request);
    const timing = { model: this.settings.model, status: response.status, durationMs: elapsedSince(started) };
    if (!response.ok) {
      const detail = (await response.text().catch(() => '')).slice(0, ERROR_DETAIL_CHARS);
      this.logger.warn(LogEvents.LlmFailed, { ...timing, detail });
      throw new ExtractionFailedError(`LLM request failed: HTTP ${response.status}`);
    }
    const body = (await response.json()) as CompletionBody;
    this.logger.debug(LogEvents.LlmCompleted, {
      ...timing,
      promptTokens: body.usage?.prompt_tokens ?? null,
      completionTokens: body.usage?.completion_tokens ?? null,
    });
    const content = body.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || content.trim() === '') throw new ExtractionFailedError('LLM reply was empty');
    return content;
  }

  private async send(request: CompletionRequest): Promise<Response> {
    const { baseUrl, model, apiKey, timeoutMs, temperature, structuredOutput } = this.settings;
    try {
      return await this.fetchImpl(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...(apiKey ? { authorization: `Bearer ${apiKey}` } : {}) },
        body: JSON.stringify({
          model,
          ...(temperature !== null && { temperature }),
          messages: request.messages,
          ...(structuredOutput && {
            response_format: {
              type: 'json_schema',
              json_schema: { name: 'extracted_document', strict: true, schema: request.jsonSchema },
            },
          }),
        }),
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const reason =
        error instanceof Error && error.name === 'TimeoutError' ? `timed out after ${timeoutMs} ms` : 'unreachable';
      throw new ExtractionFailedError(`LLM request ${reason}`);
    }
  }
}

function elapsedSince(started: number): number {
  return Math.round(performance.now() - started);
}
