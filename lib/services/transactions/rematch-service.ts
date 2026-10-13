import type { ExtractedDocument } from '@/lib/extraction/types';
import { LogEvents } from '@/lib/logging/log-events';
import type { Logger } from '@/lib/logging/logger';
import { serializeError } from '@/lib/logging/serialize-error';
import type { ExtractionSnapshot, StoredDocument } from '@/lib/repositories/records';
import type { Repositories } from '@/lib/repositories/unit-of-work';
import { logMatchDecision } from '@/lib/services/ingestion/match-logging';
import type { MatchStage } from '@/lib/services/ingestion/match-stage';
import { senderOfDocument } from '@/lib/services/ingestion/sender-identity';
import type { SenderResolver } from '@/lib/services/ingestion/sender-resolver';
import type { DateRules } from '@/lib/services/matching/matching-config';

const MS_PER_DAY = 86_400_000;

export interface RematchDependencies {
  repositories: Repositories;
  matchStage: MatchStage;
  senders: SenderResolver;
  dateRules: Pick<DateRules, 'windows'>;
  logger: Logger;
}

export interface NewTransactionFacts {
  id: number;
  clientId: number;
  driverPhone: string | null;
  transactionAt: Date;
}

export interface RematchSummary {
  examined: number;
  rematched: number;
}

/**
 * Bonus B2: when a transaction arrives, re-run matching for UNMATCHED documents it could explain (a receipt that
 * arrived before its transaction). Uses the same MatchStage as first-time processing, never re-proposes a transaction
 * already proposed for a document, and isolates failures per document.
 */
export class RematchService {
  constructor(private readonly deps: RematchDependencies) {}

  async rematchFor(transaction: NewTransactionFacts): Promise<RematchSummary> {
    const documents = await this.deps.repositories.documents.findUnmatchedNear({
      clientId: transaction.clientId,
      driverPhone: transaction.driverPhone,
      ...this.documentDateRange(transaction.transactionAt),
    });
    let rematched = 0;
    for (const document of documents) {
      if (await this.rematch(document, transaction.id)) rematched += 1;
    }
    const summary = { examined: documents.length, rematched };
    this.deps.logger.info(LogEvents.RematchCompleted, { transactionId: transaction.id, ...summary });
    return summary;
  }

  /** Document dates that could pair with this transaction under any document type's window (+1 day slack). */
  private documentDateRange(transactionAt: Date): { from: Date; to: Date } {
    const windows = Object.values(this.deps.dateRules.windows);
    const earliest = Math.min(...windows.map((window) => window.minDays)) - 1;
    const latest = Math.max(...windows.map((window) => window.maxDays)) + 1;
    return {
      from: new Date(transactionAt.getTime() + earliest * MS_PER_DAY),
      to: new Date(transactionAt.getTime() + latest * MS_PER_DAY),
    };
  }

  private async rematch(document: StoredDocument, transactionId: number): Promise<boolean> {
    const logger = this.deps.logger.child({ documentId: document.id, triggeredByTransaction: transactionId });
    try {
      if (document.extraction === null) return false;
      const proposed = await this.deps.repositories.matches.listForDocument(document.id);
      const result = await this.deps.matchStage.run({
        documentId: document.id,
        from: 'UNMATCHED',
        extraction: toExtractedDocument(document.extraction),
        scope: await this.deps.senders.resolve(senderOfDocument(document)),
        excludeTransactionIds: new Set(proposed.map((match) => match.transactionId)),
      });
      logMatchDecision(logger, result, { rematch: true });
      return result.outcome !== 'UNMATCHED';
    } catch (error) {
      logger.error(LogEvents.DocumentFailed, { stage: 'rematch', error: serializeError(error) });
      return false;
    }
  }
}

function toExtractedDocument(snapshot: ExtractionSnapshot): ExtractedDocument {
  return { ...snapshot, documentDate: snapshot.documentDate?.toISOString() ?? null };
}
