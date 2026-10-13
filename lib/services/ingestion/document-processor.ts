import type { Clock } from '@/lib/domain/clock';
import { parseDocumentDate } from '@/lib/domain/document-date';
import { ExtractionFailedError, InvalidExtractionError } from '@/lib/extraction/extraction-errors';
import { parseExtractedDocument } from '@/lib/extraction/extraction-result.schema';
import type { DocumentExtractor, ExtractedDocument } from '@/lib/extraction/types';
import { LogEvents } from '@/lib/logging/log-events';
import type { Logger } from '@/lib/logging/logger';
import { serializeError } from '@/lib/logging/serialize-error';
import type { StoredDocument } from '@/lib/repositories/records';
import { ConfirmedSlotTakenError } from '@/lib/repositories/repository-errors';
import type { Repositories, UnitOfWork } from '@/lib/repositories/unit-of-work';
import type { BlobStore } from '@/lib/storage/blob-store';
import { candidateWindow } from '@/lib/services/matching/candidate-window';
import type { DateRules } from '@/lib/services/matching/matching-config';
import type { CandidateTransaction, MatchDocumentFn, MatchResult, SenderScope } from '@/lib/services/matching/types';

import { changeDocumentStatus } from './document-state-machine';
import { demoteToReview, documentStatusFor, matchesToPersist } from './match-persistence';
import { senderOfDocument } from './sender-identity';
import type { SenderResolver } from './sender-resolver';

const UNKNOWN_SENDER_RESULT: MatchResult = {
  outcome: 'UNMATCHED',
  candidates: [],
  reasons: ['UNKNOWN_SENDER'],
  excluded: { scope: 0, currency: 0, dateWindow: 0, amount: 0, card: 0 },
};

export interface ProcessorDependencies {
  repositories: Repositories;
  unitOfWork: UnitOfWork;
  blobStore: BlobStore;
  extractor: DocumentExtractor;
  senders: SenderResolver;
  matchDocument: MatchDocumentFn;
  dateRules: Pick<DateRules, 'windows'>;
  clock: Clock;
  logger: Logger;
}

/**
 * Post-response pipeline for one RECEIVED document: extract → resolve scope → load candidates → match → persist.
 * Never throws: any failure leaves the document FAILED with a reason, so a webhook can never be lost.
 */
export class DocumentProcessor {
  constructor(private readonly deps: ProcessorDependencies) {}

  async process(documentId: number): Promise<void> {
    const document = await this.deps.repositories.documents.findById(documentId);
    if (document?.status !== 'RECEIVED') return;
    const logger = this.deps.logger.child({ documentId });
    try {
      await this.run(document, logger);
    } catch (error) {
      await this.fail(document.id, error, logger);
    }
  }

  private async run(document: StoredDocument, logger: Logger): Promise<void> {
    const extraction = await this.extract(document);
    logger.info(LogEvents.ExtractionCompleted, {
      documentType: extraction.documentType,
      extractionConfidence: extraction.extractionConfidence,
    });
    const scope = await this.deps.senders.resolve(senderOfDocument(document));
    if (scope === null) logger.warn(LogEvents.SenderUnknown, { source: document.source });
    const result = scope === null ? UNKNOWN_SENDER_RESULT : await this.match(extraction, scope);
    await this.persist(document.id, result);
    logger.info(LogEvents.MatchDecided, {
      outcome: result.outcome,
      reasons: result.reasons,
      topConfidence: result.candidates[0]?.confidence ?? null,
      candidateCount: result.candidates.length,
    });
  }

  private async extract(document: StoredDocument): Promise<ExtractedDocument> {
    const bytes = await this.deps.blobStore.get(document.storageKey ?? '');
    const extraction = parseExtractedDocument(await this.deps.extractor.extract(bytes, document.mimeType));
    await changeDocumentStatus(this.deps.repositories.documents, {
      id: document.id,
      from: 'RECEIVED',
      to: 'EXTRACTED',
      extraction: { ...extraction, documentDate: parseDocumentDate(extraction.documentDate) },
    });
    return extraction;
  }

  private async match(extraction: ExtractedDocument, scope: SenderScope): Promise<MatchResult> {
    const window = candidateWindow(extraction.documentDate, this.deps.dateRules);
    const candidates: CandidateTransaction[] =
      window === null ? [] : await this.deps.repositories.transactions.findCandidates({ ...scope, ...window });
    return this.deps.matchDocument({ ...extraction, scope }, candidates);
  }

  private async persist(documentId: number, result: MatchResult): Promise<void> {
    try {
      await this.save(documentId, result);
    } catch (error) {
      if (!(error instanceof ConfirmedSlotTakenError)) throw error;
      await this.save(documentId, demoteToReview(result));
    }
  }

  private save(documentId: number, result: MatchResult): Promise<void> {
    return this.deps.unitOfWork.run(async ({ documents, matches }) => {
      await matches.createMany(documentId, matchesToPersist(result, this.deps.clock.now()));
      await changeDocumentStatus(documents, {
        id: documentId,
        from: 'EXTRACTED',
        to: documentStatusFor(result.outcome),
        decisionReasons: result.reasons,
      });
    });
  }

  private async fail(documentId: number, error: unknown, logger: Logger): Promise<void> {
    const failureReason = failureReasonFor(error);
    logger.error(LogEvents.DocumentFailed, { failureReason, error: serializeError(error) });
    for (const from of ['RECEIVED', 'EXTRACTED'] as const) {
      if (await this.deps.repositories.documents.changeStatus({ id: documentId, from, to: 'FAILED', failureReason }))
        return;
    }
  }
}

function failureReasonFor(error: unknown): string {
  if (error instanceof ExtractionFailedError) return 'EXTRACTION_ERROR';
  if (error instanceof InvalidExtractionError) return 'EXTRACTION_INVALID';
  return 'PROCESSING_ERROR';
}
