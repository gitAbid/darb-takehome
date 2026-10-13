import { z } from 'zod';

import { InvalidExtractionError } from './extraction-errors';
import type { ExtractedDocument } from './types';

/** Extractor output is untrusted (OCR / LLM JSON): validated against the brief's ExtractedDocument contract. */
export const extractedDocumentSchema = z.object({
  documentType: z.enum(['RECEIPT', 'TAX_INVOICE', 'UNKNOWN']),
  merchantName: z.string().nullable(),
  vatNumber: z.string().nullable(),
  totalAmount: z.number().int().nullable(),
  currency: z.string().nullable(),
  documentDate: z.string().nullable(),
  cardLast4: z.string().nullable(),
  invoiceNumber: z.string().nullable(),
  rawText: z.string(),
  extractionConfidence: z.number().min(0).max(1),
}) satisfies z.ZodType<ExtractedDocument>;

/** A committed fixture: either the result the mock returns, or a failure it simulates. */
export const fixtureExtractionSchema = z.discriminatedUnion('kind', [
  extractedDocumentSchema.extend({ kind: z.literal('result') }),
  z.object({ kind: z.literal('error'), message: z.string().min(1) }),
]);

export type FixtureExtraction = z.infer<typeof fixtureExtractionSchema>;

/** Validates any extractor's output; throws InvalidExtractionError listing the offending paths. */
export function parseExtractedDocument(value: unknown): ExtractedDocument {
  const parsed = extractedDocumentSchema.safeParse(value);
  if (!parsed.success) throw new InvalidExtractionError(describeIssues(parsed.error));
  return parsed.data;
}

/** "path: message" per Zod issue; "(root)" when the value itself is wrong. */
export function describeIssues(error: z.ZodError): string[] {
  return error.issues.map((issue) => `${issue.path.join('.') || '(root)'}: ${issue.message}`);
}
