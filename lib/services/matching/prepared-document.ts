import { riyadhDay } from '@/lib/domain/riyadh-day';

import type { MerchantNormalizer } from './text/merchant-normalizer';
import type { CandidateTransaction, ExtractedFields, PreparedDocument } from './types';

/**
 * Validates the extracted fields once and pre-computes what every filter and signal needs.
 * Returns null when the document cannot be matched at all (unknown type, missing or invalid amount or date).
 */
export function prepareDocument(fields: ExtractedFields, normalizer: MerchantNormalizer): PreparedDocument | null {
  const { documentType, totalAmount, documentDate } = fields;
  if (documentType === 'UNKNOWN' || !isPositiveHalalas(totalAmount) || documentDate === null) return null;
  const day = riyadhDay(documentDate);
  if (day === null) return null;
  return { fields, documentType, amount: totalAmount, day, merchantTokens: merchantTokens(fields, normalizer) };
}

/** Document day minus transaction day, in Riyadh calendar days; null when the transaction date is invalid. */
export function dayGap(doc: PreparedDocument, transaction: CandidateTransaction): number | null {
  const transactionDay = riyadhDay(transaction.transactionAt);
  return transactionDay === null ? null : doc.day - transactionDay;
}

function isPositiveHalalas(amount: number | null): amount is number {
  return amount !== null && Number.isInteger(amount) && amount > 0;
}

function merchantTokens(fields: ExtractedFields, normalizer: MerchantNormalizer): string[] | null {
  if (!fields.merchantName) return null;
  const tokens = normalizer.normalize(fields.merchantName);
  return tokens.length > 0 ? tokens : null;
}
