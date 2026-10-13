import type { MatchableDocumentType, SignalName } from './types';

/** Every tunable number of the matcher. Values and their justification: IMPLEMENTATION.md §3. */
export const defaultMatchingConfig: MatchingConfig = {
  weights: { amount: 0.4, date: 0.2, merchant: 0.2, card: 0.2, scope: 0 },
  amount: {
    roundingToleranceHalalas: 5,
    nearRatio: 0.01,
    maxTipRatio: 0.2,
    tipMccs: ['5812', '5814'],
    tipScore: 0.7,
    nearScore: 0.5,
  },
  date: {
    windows: { RECEIPT: { minDays: -3, maxDays: 1 }, TAX_INVOICE: { minDays: -1, maxDays: 30 } },
    scores: [
      { maxGapDays: 0, score: 1 },
      { maxGapDays: 1, score: 0.8 },
      { maxGapDays: 2, score: 0.6 },
      { maxGapDays: 3, score: 0.4 },
      { maxGapDays: 7, score: 0.2 },
    ],
    fallbackScore: 0.1,
  },
  card: { possibleMisreadScore: 0.3 },
  thresholds: { autoMatch: 0.85, review: 0.5, minMargin: 0.1, strongMerchant: 0.8, minOcrConfidence: 0.8 },
  maxStoredCandidates: 5,
};

export interface AmountRules {
  /** |charged − receipt| at or below this is an exact match (VAT rounding). */
  roundingToleranceHalalas: number;
  /** |difference| at or below this share of the receipt is a near match. */
  nearRatio: number;
  /** Largest tip, as a share of the receipt, at a tipping merchant. */
  maxTipRatio: number;
  /** Merchant category codes where tips happen (restaurants, fast food). */
  tipMccs: readonly string[];
  tipScore: number;
  nearScore: number;
}

export interface DateRules {
  /** Allowed document-day minus transaction-day range, per document type. */
  windows: Readonly<Record<MatchableDocumentType, { minDays: number; maxDays: number }>>;
  /** Score by absolute day gap; the first entry whose maxGapDays covers the gap wins. */
  scores: readonly { maxGapDays: number; score: number }[];
  fallbackScore: number;
}

export interface CardRules {
  possibleMisreadScore: number;
}

export interface DecisionThresholds {
  autoMatch: number;
  review: number;
  minMargin: number;
  strongMerchant: number;
  minOcrConfidence: number;
}

export interface MatchingConfig {
  weights: Readonly<Record<SignalName, number>>;
  amount: AmountRules;
  date: DateRules;
  card: CardRules;
  thresholds: DecisionThresholds;
  maxStoredCandidates: number;
}
