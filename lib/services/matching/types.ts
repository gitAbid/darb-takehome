import type { CandidateFlag, ReasonCode } from '@/lib/domain/reason-codes';
import type { ExtractedDocument } from '@/lib/extraction/types';

/** Hard filters, in the order they are applied. */
export const FILTER_NAMES = ['scope', 'currency', 'dateWindow', 'amount', 'card'] as const;

export type FilterName = (typeof FILTER_NAMES)[number];
export type SignalName = 'amount' | 'date' | 'merchant' | 'card' | 'scope';
export type MatchOutcome = 'AUTO_MATCHED' | 'NEEDS_REVIEW' | 'UNMATCHED';
export type MatchableDocumentType = Exclude<ExtractedDocument['documentType'], 'UNKNOWN'>;

/** Which transactions a document may match, derived from who sent it. */
export interface SenderScope {
  clientIds: readonly number[];
  /** Set for WhatsApp: only this driver's transactions are eligible. */
  driverPhone: string | null;
}

/** The extracted fields the matcher needs, plus the sender scope. */
export interface ExtractedFields extends Pick<
  ExtractedDocument,
  'documentType' | 'merchantName' | 'totalAmount' | 'currency' | 'documentDate' | 'cardLast4' | 'extractionConfidence'
> {
  scope: SenderScope;
}

export interface CandidateTransaction {
  id: number;
  clientId: number;
  driverPhone: string | null;
  cardLast4: string;
  merchantName: string;
  mcc: string;
  /** Minor units (halalas). */
  amount: number;
  currency: string;
  transactionAt: Date;
  hasConfirmedDocument: boolean;
}

export interface MatchCandidate {
  transactionId: number;
  confidence: number;
  /** Only the signals that could be measured; e.g. no `card` key when the receipt shows no card digits. */
  signals: Record<string, number>;
  flags: CandidateFlag[];
}

export interface MatchResult {
  outcome: MatchOutcome;
  /** Ranked, best first; only candidates at or above the review threshold. */
  candidates: MatchCandidate[];
  reasons: ReasonCode[];
  /** How many transactions each hard filter removed. */
  excluded: Record<FilterName, number>;
}

/** Document fields validated and pre-computed once per match run. */
export interface PreparedDocument {
  fields: ExtractedFields;
  documentType: MatchableDocumentType;
  amount: number;
  /** Riyadh calendar day of the document date. */
  day: number;
  /** Normalized merchant tokens, or null when the merchant name is missing or pure noise. */
  merchantTokens: string[] | null;
}

export interface ScoredCandidate {
  transaction: CandidateTransaction;
  confidence: number;
  signals: Record<string, number>;
  flags: CandidateFlag[];
  /** Document day minus transaction day; Infinity when the transaction date is invalid. */
  dayGap: number;
}

export type MatchDocumentFn = (doc: ExtractedFields, transactions: readonly CandidateTransaction[]) => MatchResult;
