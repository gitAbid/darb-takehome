import { LogEvents } from '@/lib/logging/log-events';
import type { Logger } from '@/lib/logging/logger';
import type { TransactionRepository } from '@/lib/repositories/transaction-repository';
import type { BackgroundScheduler } from '@/lib/services/ingestion/background-scheduler';
import type { PayloadIssue } from '@/lib/webhooks/inbound-message';
import { toPayloadIssues } from '@/lib/webhooks/payload-issues';

import type { RematchService } from './rematch-service';
import { transactionPayloadSchema } from './transaction-payload.schema';

export type TransactionIngestResult =
  { kind: 'created' | 'duplicate'; transactionId: number } | { kind: 'invalid'; issues: PayloadIssue[] };

export interface TransactionIngestionDependencies {
  transactions: TransactionRepository;
  rematch: RematchService;
  scheduler: BackgroundScheduler;
  logger: Logger;
}

/** Card-feed entry point: validate, store once (idempotent on externalRef), then re-match after the response. */
export class TransactionIngestionService {
  constructor(private readonly deps: TransactionIngestionDependencies) {}

  async receive(payload: unknown): Promise<TransactionIngestResult> {
    const parsed = transactionPayloadSchema.safeParse(payload);
    if (!parsed.success) return this.reject(toPayloadIssues(parsed.error));
    const transaction = parsed.data;
    if (!(await this.deps.transactions.cardBelongsToClient(transaction.cardId, transaction.clientId))) {
      return this.reject([{ path: 'cardId', message: 'card does not belong to this client' }]);
    }
    const inserted = await this.deps.transactions.insert(transaction);
    this.deps.logger.info(LogEvents.TransactionReceived, { transactionId: inserted.id, result: inserted.kind });
    if (inserted.kind === 'created') {
      this.deps.scheduler.schedule(async () => {
        await this.deps.rematch.rematchFor({ ...transaction, id: inserted.id });
      });
    }
    return { kind: inserted.kind, transactionId: inserted.id };
  }

  private reject(issues: PayloadIssue[]): TransactionIngestResult {
    this.deps.logger.warn(LogEvents.WebhookRejected, {
      channel: 'transactions',
      issues: issues.map((issue) => issue.path),
    });
    return { kind: 'invalid', issues };
  }
}
