import { LogEvents } from '@/lib/logging/log-events';
import type { Logger } from '@/lib/logging/logger';
import { serializeError } from '@/lib/logging/serialize-error';
import type { WebhookOutcome } from '@/lib/services/document-ingestion';
import type { SignatureVerifier } from '@/lib/webhooks/security/signature-verifier';

import { readSignedJson } from './read-json';

export type WebhookHandler = (request: Request) => Promise<Response>;

/**
 * HTTP contract (IMPLEMENTATION.md §5.3): 401 for a missing or invalid signature, 400 for an unreadable or malformed payload, 200 once every message is
 * persisted (created, duplicate or ignored), 500 only when nothing could be persisted — so the provider retries.
 */
export function createWebhookHandler(
  receive: (payload: unknown) => Promise<WebhookOutcome>,
  verifier: SignatureVerifier,
  logger: Logger,
): WebhookHandler {
  return async (request) => {
    const body = await readSignedJson(request, verifier, logger);
    if ('response' in body) return body.response;
    try {
      const outcome = await receive(body.payload);
      if (outcome.kind === 'invalid')
        return Response.json({ error: 'INVALID_PAYLOAD', issues: outcome.issues }, { status: 400 });
      return Response.json({ results: outcome.results }, { status: 200 });
    } catch (error) {
      logger.error(LogEvents.DocumentFailed, { stage: 'intake', error: serializeError(error) });
      return Response.json({ error: 'INTERNAL' }, { status: 500 });
    }
  };
}
