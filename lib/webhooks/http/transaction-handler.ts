import { LogEvents } from '@/lib/logging/log-events';
import type { Logger } from '@/lib/logging/logger';
import { serializeError } from '@/lib/logging/serialize-error';
import type { TransactionIngestResult } from '@/lib/services/transactions/transaction-ingestion';

import { INVALID_JSON, invalidJsonResponse, readJson } from './read-json';
import type { WebhookHandler } from './webhook-handler';

const STATUS: Readonly<Record<TransactionIngestResult['kind'], number>> = {
  created: 201,
  duplicate: 200,
  invalid: 400,
};

/** Card-feed HTTP contract: 201 created, 200 duplicate (same externalRef), 400 invalid, 500 when nothing was stored. */
export function createTransactionHandler(
  receive: (payload: unknown) => Promise<TransactionIngestResult>,
  logger: Logger,
): WebhookHandler {
  return async (request) => {
    const payload = await readJson(request);
    if (payload === INVALID_JSON) return invalidJsonResponse();
    try {
      const result = await receive(payload);
      const body = result.kind === 'invalid' ? { error: 'INVALID_PAYLOAD', issues: result.issues } : result;
      return Response.json(body, { status: STATUS[result.kind] });
    } catch (error) {
      logger.error(LogEvents.TransactionReceived, { stage: 'ingest', error: serializeError(error) });
      return Response.json({ error: 'INTERNAL' }, { status: 500 });
    }
  };
}
