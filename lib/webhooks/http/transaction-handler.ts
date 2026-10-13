import { LogEvents } from '@/lib/logging/log-events';
import type { Logger } from '@/lib/logging/logger';
import { serializeError } from '@/lib/logging/serialize-error';
import type { TransactionIngestResult } from '@/lib/services/transactions/transaction-ingestion';
import type { SignatureVerifier } from '@/lib/webhooks/security/signature-verifier';

import { readSignedJson } from './read-json';
import type { WebhookHandler } from './webhook-handler';

const STATUS: Readonly<Record<TransactionIngestResult['kind'], number>> = {
  created: 201,
  duplicate: 200,
  invalid: 400,
};

/** Card-feed HTTP contract: 401 bad signature, 201 created, 200 duplicate (same externalRef), 400 invalid, 500 when nothing was stored. */
export function createTransactionHandler(
  receive: (payload: unknown) => Promise<TransactionIngestResult>,
  verifier: SignatureVerifier,
  logger: Logger,
): WebhookHandler {
  return async (request) => {
    const signed = await readSignedJson(request, verifier, logger);
    if ('response' in signed) return signed.response;
    try {
      const result = await receive(signed.payload);
      const body = result.kind === 'invalid' ? { error: 'INVALID_PAYLOAD', issues: result.issues } : result;
      return Response.json(body, { status: STATUS[result.kind] });
    } catch (error) {
      logger.error(LogEvents.TransactionReceived, { stage: 'ingest', error: serializeError(error) });
      return Response.json({ error: 'INTERNAL' }, { status: 500 });
    }
  };
}
