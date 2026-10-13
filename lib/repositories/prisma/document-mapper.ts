import type { Document as DocumentRow, Prisma } from '@prisma/client';
import { z } from 'zod';

import { REASON_CODES, type ReasonCode } from '@/lib/domain/reason-codes';

import type { DocumentStatusChange, ExtractionSnapshot, NewDocument, StoredDocument } from '../records';

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;
const reasonsSchema = z.array(z.enum(REASON_CODES));

export function toDocumentCreateInput(document: NewDocument): Prisma.DocumentUncheckedCreateInput {
  return { ...document };
}

export function toStoredDocument(row: DocumentRow): StoredDocument {
  return {
    id: row.id,
    source: row.source,
    externalId: row.externalId,
    contentHash: row.contentHash,
    senderIdentifier: row.senderIdentifier,
    recipientIdentifier: row.recipientIdentifier,
    clientId: row.clientId,
    status: row.status,
    failureReason: row.failureReason,
    storageKey: row.storageKey,
    mimeType: row.mimeType,
    decisionReasons: parseDecisionReasons(row),
    extraction: toExtraction(row),
    receivedAt: row.receivedAt,
  };
}

export function toStatusChangeData(change: DocumentStatusChange): Prisma.DocumentUpdateManyMutationInput {
  return {
    status: change.to,
    ...(change.failureReason !== undefined && { failureReason: change.failureReason }),
    ...(change.decisionReasons !== undefined && { decisionReasons: [...change.decisionReasons] }),
    ...(change.extraction !== undefined && toExtractionData(change.extraction)),
  };
}

/**
 * Converts an extracted ISO date to the stored DateTime. A date-only value becomes UTC midnight of that calendar
 * date; anything unparseable becomes null rather than a wrong date.
 */
export function toDocumentDate(value: string | null): Date | null {
  if (value === null) return null;
  const trimmed = value.trim();
  const date = new Date(DATE_ONLY.test(trimmed) ? `${trimmed}T00:00:00.000Z` : trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Parses JSON read back from the database; corrupt data raises instead of being silently cast. */
export function parseStoredJson<T>(schema: z.ZodType<T>, value: unknown, description: string): T {
  const parsed = schema.safeParse(value);
  if (parsed.success) return parsed.data;
  throw new Error(
    `Corrupt stored JSON in ${description}: ${parsed.error.issues.map((issue) => issue.message).join('; ')}`,
  );
}

function parseDecisionReasons(row: DocumentRow): ReasonCode[] {
  if (row.decisionReasons === null) return [];
  return parseStoredJson(reasonsSchema, row.decisionReasons, `Document ${row.id}.decisionReasons`);
}

function toExtraction(row: DocumentRow): ExtractionSnapshot | null {
  if (row.documentType === null) return null;
  return {
    documentType: row.documentType,
    merchantName: row.merchantName,
    vatNumber: row.vatNumber,
    totalAmount: row.totalAmount,
    currency: row.currency,
    documentDate: row.documentDate,
    cardLast4: row.cardLast4,
    invoiceNumber: row.invoiceNumber,
    rawText: row.rawText ?? '',
    extractionConfidence: row.extractionConfidence ?? 0,
  };
}

function toExtractionData(extraction: ExtractionSnapshot): Prisma.DocumentUpdateManyMutationInput {
  return {
    documentType: extraction.documentType,
    merchantName: extraction.merchantName,
    vatNumber: extraction.vatNumber,
    totalAmount: extraction.totalAmount,
    currency: extraction.currency,
    documentDate: extraction.documentDate,
    cardLast4: extraction.cardLast4,
    invoiceNumber: extraction.invoiceNumber,
    rawText: extraction.rawText,
    extractionConfidence: extraction.extractionConfidence,
  };
}
