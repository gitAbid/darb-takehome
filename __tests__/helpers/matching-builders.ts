import { prepareDocument } from '@/lib/services/matching/prepared-document';
import { DefaultMerchantNormalizer } from '@/lib/services/matching/text/default-merchant-normalizer';
import type {
  CandidateTransaction,
  ExtractedFields,
  PreparedDocument,
  SenderScope,
} from '@/lib/services/matching/types';

export const CLIENT_1_SCOPE: SenderScope = { clientIds: [1], driverPhone: null };

/** A receipt that, by default, exactly matches buildTransaction()'s defaults. */
export function buildFields(overrides: Partial<ExtractedFields> = {}): ExtractedFields {
  return {
    documentType: 'RECEIPT',
    merchantName: 'Alfanar Fuel Station 04',
    totalAmount: 15000,
    currency: 'SAR',
    documentDate: '2025-06-10',
    cardLast4: '4471',
    extractionConfidence: 0.95,
    scope: CLIENT_1_SCOPE,
    ...overrides,
  };
}

export function buildTransaction(overrides: Partial<CandidateTransaction> = {}): CandidateTransaction {
  return {
    id: 1,
    clientId: 1,
    driverPhone: '+966551234567',
    cardLast4: '4471',
    merchantName: 'ALFANAR FUEL ST 04 RUH',
    mcc: '5541',
    amount: 15000,
    currency: 'SAR',
    transactionAt: new Date('2025-06-10T07:42:00Z'),
    hasConfirmedDocument: false,
    ...overrides,
  };
}

/** Prepares fields with the real normalizer; throws if the fields are not matchable (tests should not hit that). */
export function buildPrepared(overrides: Partial<ExtractedFields> = {}): PreparedDocument {
  const doc = prepareDocument(buildFields(overrides), new DefaultMerchantNormalizer());
  if (doc === null) throw new Error('buildPrepared: fields are not matchable');
  return doc;
}
