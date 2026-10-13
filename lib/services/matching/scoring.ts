import type { CandidateFlag } from '@/lib/domain/reason-codes';

import { dayGap } from './prepared-document';
import type { SignalScorer } from './signals/signal-scorer';
import type { CandidateTransaction, PreparedDocument, ScoredCandidate, SignalName } from './types';

const SCORE_PRECISION = 10_000;

/**
 * Runs every signal and combines the measurable ones into a weighted average.
 * Unmeasurable signals are left out of both the breakdown and the weighting, so a receipt is never
 * penalized for not printing something.
 */
export function scoreCandidate(
  doc: PreparedDocument,
  transaction: CandidateTransaction,
  scorers: readonly SignalScorer[],
  weights: Readonly<Record<SignalName, number>>,
): ScoredCandidate {
  const signals: Record<string, number> = {};
  const flags: CandidateFlag[] = [];
  let weightedSum = 0;
  let totalWeight = 0;
  for (const scorer of scorers) {
    const result = scorer.score(doc, transaction);
    if (result === null) continue;
    signals[scorer.name] = roundScore(result.value);
    if (result.flag) flags.push(result.flag);
    weightedSum += weights[scorer.name] * result.value;
    totalWeight += weights[scorer.name];
  }
  const confidence = totalWeight > 0 ? roundScore(weightedSum / totalWeight) : 0;
  return { transaction, confidence, signals, flags, dayGap: dayGap(doc, transaction) ?? Number.POSITIVE_INFINITY };
}

/** Clamps to [0, 1] and rounds to 4 decimals so that floating-point noise never decides a comparison. */
export function roundScore(value: number): number {
  const clamped = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
  return Math.round(clamped * SCORE_PRECISION) / SCORE_PRECISION;
}
