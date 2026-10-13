import type { ReasonCode } from '@/lib/domain/reason-codes';

import type { MatchOutcome, PreparedDocument, ScoredCandidate } from '../types';

export interface Decision {
  outcome: MatchOutcome;
  reasons: ReasonCode[];
  /** The candidates worth keeping (persisting / showing to a reviewer), best first. */
  candidates: ScoredCandidate[];
}

/** Turns ranked candidates into an outcome. */
export interface DecisionPolicy {
  decide(doc: PreparedDocument, ranked: readonly ScoredCandidate[]): Decision;
}
