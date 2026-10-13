import type { ScoredCandidate } from './types';

/**
 * Best first: higher confidence, then closer date, then earlier transaction, then lower id.
 * The tie-breaks make the order fully deterministic, whatever order the transactions arrived in.
 */
export function rankCandidates(candidates: readonly ScoredCandidate[]): ScoredCandidate[] {
  return [...candidates].sort(compareCandidates);
}

function compareCandidates(a: ScoredCandidate, b: ScoredCandidate): number {
  return (
    b.confidence - a.confidence ||
    Math.abs(a.dayGap) - Math.abs(b.dayGap) ||
    a.transaction.transactionAt.getTime() - b.transaction.transactionAt.getTime() ||
    a.transaction.id - b.transaction.id
  );
}
