import { contentHash } from '@/lib/domain/content-hash';

import { ExtractionFailedError } from './extraction-errors';
import { extractedDocumentSchema } from './extraction-result.schema';
import type { FixtureRegistry } from './fixture-registry';
import type { DocumentExtractor, ExtractedDocument } from './types';

/** What a real OCR returns for an unreadable image: nothing usable, near-zero confidence. */
const UNREADABLE_RESULT: ExtractedDocument = {
  documentType: 'UNKNOWN',
  merchantName: null,
  vatNumber: null,
  totalAmount: null,
  currency: null,
  documentDate: null,
  cardLast4: null,
  invoiceNumber: null,
  rawText: '',
  extractionConfidence: 0,
};

/** Deterministic, fixture-backed extractor keyed by the SHA-256 of the file. Swappable for a real provider. */
export class MockExtractor implements DocumentExtractor {
  constructor(private readonly registry: FixtureRegistry) {}

  // The declared mimeType is not needed: fixtures are identified by their bytes alone.
  async extract(file: Buffer): Promise<ExtractedDocument> {
    const entry = this.registry.lookup(contentHash(file));
    if (entry === undefined) return { ...UNREADABLE_RESULT };
    if (entry.extraction.kind === 'error') throw new ExtractionFailedError(entry.extraction.message);
    return extractedDocumentSchema.parse(entry.extraction); // strips the fixture-only `kind` field
  }
}
