import type { ReasonCode } from '@/lib/domain/reason-codes';

import type { DecisionThresholds } from '../matching-config';
import type { PreparedDocument, ScoredCandidate } from '../types';

/** Every auto-match gate; the top candidate is auto-matched only if none of them fails. See IMPLEMENTATION.md §3.5. */
export const DEFAULT_GATES: readonly DecisionGate[] = [
  {
    reason: 'BELOW_AUTO_THRESHOLD',
    fails: ({ top, thresholds }) => !(top.confidence >= thresholds.autoMatch),
  },
  {
    reason: 'AMOUNT_NOT_EXACT',
    fails: ({ top }) => top.signals.amount !== 1 && !top.flags.includes('AMOUNT_TIP_TOLERANCE'),
  },
  {
    reason: 'WEAK_IDENTITY',
    fails: ({ top, thresholds }) =>
      top.signals.card !== 1 && !((top.signals.merchant ?? 0) >= thresholds.strongMerchant),
  },
  {
    reason: 'NEAR_TIE',
    fails: ({ top, runnerUp, thresholds }) => runnerUp !== undefined && margin(top, runnerUp) < thresholds.minMargin,
  },
  {
    reason: 'LOW_OCR_CONFIDENCE',
    fails: ({ doc, thresholds }) => !(doc.fields.extractionConfidence >= thresholds.minOcrConfidence),
  },
  {
    reason: 'TXN_ALREADY_HAS_DOCUMENT',
    fails: ({ top }) => top.transaction.hasConfirmedDocument,
  },
];

export interface GateContext {
  doc: PreparedDocument;
  top: ScoredCandidate;
  runnerUp: ScoredCandidate | undefined;
  thresholds: DecisionThresholds;
}

/** One condition that must hold before the system may attach a document without a human. */
export interface DecisionGate {
  readonly reason: ReasonCode;
  fails(context: GateContext): boolean;
}

function margin(top: ScoredCandidate, runnerUp: ScoredCandidate): number {
  return Math.round((top.confidence - runnerUp.confidence) * 10_000) / 10_000;
}
