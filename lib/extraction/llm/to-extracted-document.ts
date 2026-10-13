import type { ExtractedDocument } from '../types';

import {
  normalizeCardLast4,
  normalizeCurrency,
  normalizeText,
  normalizeVatNumber,
  parseAmountToHalalas,
  parseDateAsPrinted,
} from './field-parsers';
import type { LlmExtraction } from './llm-extraction.schema';

/**
 * Where each model field lands. Adding a field to the schema reaches the prompt automatically, but fails the
 * typecheck here until someone decides how it is used — new data never flows into matching by accident.
 */
export const FIELD_ROUTING = {
  documentType: 'documentType',
  merchantName: 'merchantName',
  vatNumber: 'vatNumber',
  invoiceNumber: 'invoiceNumber',
  totalAsPrinted: 'totalAmount',
  currency: 'currency',
  dateAsPrinted: 'documentDate',
  cardLast4: 'cardLast4',
  rawText: 'rawText',
  confidence: 'extractionConfidence',
} as const satisfies Record<keyof LlmExtraction, keyof ExtractedDocument>;

/** Fields a document needs to be matched at all; each one missing caps the confidence (see extractionConfidence). */
const ESSENTIAL_CHECKS: ((document: Omit<ExtractedDocument, 'extractionConfidence'>) => boolean)[] = [
  (document) => document.totalAmount !== null,
  (document) => document.documentDate !== null,
  (document) => document.merchantName !== null,
  (document) => document.documentType !== 'UNKNOWN',
];

export function toExtractedDocument(reply: LlmExtraction): ExtractedDocument {
  const document = {
    documentType: reply.documentType,
    merchantName: normalizeText(reply.merchantName),
    vatNumber: normalizeVatNumber(reply.vatNumber),
    invoiceNumber: normalizeText(reply.invoiceNumber),
    totalAmount: parseAmountToHalalas(reply.totalAsPrinted),
    currency: normalizeCurrency(reply.currency),
    documentDate: parseDateAsPrinted(reply.dateAsPrinted),
    cardLast4: normalizeCardLast4(reply.cardLast4),
    rawText: reply.rawText,
  };
  return { ...document, extractionConfidence: extractionConfidence(reply.confidence, document) };
}

/**
 * The lower of what the model claims and what we can verify. A model's self-reported confidence is not calibrated,
 * so a confident reply with missing essentials still lands below the auto-match gate (0.80) and goes to review.
 */
export function extractionConfidence(
  claimed: number,
  document: Omit<ExtractedDocument, 'extractionConfidence'>,
): number {
  const verified = ESSENTIAL_CHECKS.filter((check) => check(document)).length / ESSENTIAL_CHECKS.length;
  return Math.round(Math.min(claimed, verified) * 100) / 100;
}
