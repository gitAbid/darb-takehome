import { LogEvents } from '@/lib/logging/log-events';
import type { Logger } from '@/lib/logging/logger';
import { serializeError } from '@/lib/logging/serialize-error';
import type { WebhookOutcome } from '@/lib/services/document-ingestion';

const INVALID_JSON = Symbol('invalid-json');

export type WebhookHandler = (request: Request) => Promise<Response>;

/**
 * HTTP contract (IMPLEMENTATION.md §5.3): 400 for an unreadable or malformed payload, 200 once every message is
 * persisted (created, duplicate or ignored), 500 only when nothing could be persisted — so the provider retries.
 */
export function createWebhookHandler(
  receive: (payload: unknown) => Promise<WebhookOutcome>,
  logger: Logger,
): WebhookHandler {
  return async (request) => {
    const payload = await readJson(request);
    if (payload === INVALID_JSON) {
      return Response.json(
        { error: 'INVALID_JSON', issues: [{ path: '(root)', message: 'Body is not JSON' }] },
        { status: 400 },
      );
    }
    try {
      const outcome = await receive(payload);
      if (outcome.kind === 'invalid')
        return Response.json({ error: 'INVALID_PAYLOAD', issues: outcome.issues }, { status: 400 });
      return Response.json({ results: outcome.results }, { status: 200 });
    } catch (error) {
      logger.error(LogEvents.DocumentFailed, { stage: 'intake', error: serializeError(error) });
      return Response.json({ error: 'INTERNAL' }, { status: 500 });
    }
  };
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return INVALID_JSON;
  }
}
