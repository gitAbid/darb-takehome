import { parseDocumentDate } from '@/lib/domain/document-date';
import { ExtractionFailedError, InvalidExtractionError } from '@/lib/extraction/extraction-errors';
import { parseExtractedDocument } from '@/lib/extraction/extraction-result.schema';
import type { DocumentExtractor, ExtractedDocument } from '@/lib/extraction/types';
import { LogEvents } from '@/lib/logging/log-events';
import type { Logger } from '@/lib/logging/logger';
import { serializeError } from '@/lib/logging/serialize-error';
import type { StoredDocument } from '@/lib/repositories/records';
import type { Repositories } from '@/lib/repositories/unit-of-work';
import type { BlobStore } from '@/lib/storage/blob-store';

import { changeDocumentStatus } from './document-state-machine';
import { logMatchDecision } from './match-logging';
import type { MatchStage } from './match-stage';
import { senderOfDocument } from './sender-identity';
import type { SenderResolver } from './sender-resolver';

export interface ProcessorDependencies {
  repositories: Repositories;
  blobStore: BlobStore;
  extractor: DocumentExtractor;
  senders: SenderResolver;
  matchStage: MatchStage;
  logger: Logger;
}

/**
 * Post-response pipeline for one RECEIVED document: extract → resolve scope → match stage.
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
    logger.debug(LogEvents.DocumentProcessing, { source: document.source, mimeType: document.mimeType });
    const started = performance.now();
    const extraction = await this.extract(document);
    logger.info(LogEvents.ExtractionCompleted, {
      documentType: extraction.documentType,
      extractionConfidence: extraction.extractionConfidence,
      durationMs: Math.round(performance.now() - started),
    });
    logger.debug(LogEvents.ExtractionFields, extractedFields(extraction));
    const scope = await this.deps.senders.resolve(senderOfDocument(document));
    if (scope === null) logger.warn(LogEvents.SenderUnknown, { source: document.source });
    const result = await this.deps.matchStage.run({ documentId: document.id, from: 'EXTRACTED', extraction, scope });
    logMatchDecision(logger, result);
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

  private async fail(documentId: number, error: unknown, logger: Logger): Promise<void> {
    const failureReason = failureReasonFor(error);
    logger.error(LogEvents.DocumentFailed, { failureReason, error: serializeError(error) });
    for (const from of ['RECEIVED', 'EXTRACTED'] as const) {
      if (await this.deps.repositories.documents.changeStatus({ id: documentId, from, to: 'FAILED', failureReason })) {
        return;
      }
    }
  }
}

/** What was read, for debugging a wrong match. Card digits and OCR text are left out (privacy, ARCHITECTURE §7). */
function extractedFields(extraction: ExtractedDocument): Record<string, unknown> {
  return {
    merchantName: extraction.merchantName,
    totalAmount: extraction.totalAmount,
    currency: extraction.currency,
    documentDate: extraction.documentDate,
    hasCardLast4: extraction.cardLast4 !== null,
    hasVatNumber: extraction.vatNumber !== null,
    invoiceNumber: extraction.invoiceNumber,
  };
}

function failureReasonFor(error: unknown): string {
  if (error instanceof ExtractionFailedError) return 'EXTRACTION_ERROR';
  if (error instanceof InvalidExtractionError) return 'EXTRACTION_INVALID';
  return 'PROCESSING_ERROR';
}
