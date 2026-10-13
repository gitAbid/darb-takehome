import { sortReasons, type ReasonCode } from '@/lib/domain/reason-codes';

import type { MatchingConfig } from '../matching-config';
import type { PreparedDocument, ScoredCandidate } from '../types';
import { DEFAULT_GATES, type DecisionGate } from './decision-gates';
import type { Decision, DecisionPolicy } from './decision-policy';

/**
 * Auto-matches only when every gate passes for the top candidate; otherwise asks a human,
 * reporting one reason per failed gate and per candidate flag.
 */
export class GatedDecisionPolicy implements DecisionPolicy {
  constructor(
    private readonly config: Pick<MatchingConfig, 'thresholds' | 'maxStoredCandidates'>,
    private readonly gates: readonly DecisionGate[] = DEFAULT_GATES,
  ) {}

  decide(doc: PreparedDocument, ranked: readonly ScoredCandidate[]): Decision {
    if (ranked.length === 0) return { outcome: 'UNMATCHED', reasons: ['NO_CANDIDATES'], candidates: [] };
    const plausible = this.plausibleCandidates(ranked);
    if (plausible.length === 0) return { outcome: 'UNMATCHED', reasons: ['LOW_SCORE'], candidates: [] };
    const reasons = this.failedGateReasons(doc, ranked);
    if (reasons.length === 0) return { outcome: 'AUTO_MATCHED', reasons: ['ALL_GATES_PASSED'], candidates: plausible };
    return { outcome: 'NEEDS_REVIEW', reasons, candidates: plausible };
  }

  private plausibleCandidates(ranked: readonly ScoredCandidate[]): ScoredCandidate[] {
    const { thresholds, maxStoredCandidates } = this.config;
    return ranked.filter((candidate) => candidate.confidence >= thresholds.review).slice(0, maxStoredCandidates);
  }

  private failedGateReasons(doc: PreparedDocument, ranked: readonly ScoredCandidate[]): ReasonCode[] {
    const [top, runnerUp] = ranked;
    const context = { doc, top, runnerUp, thresholds: this.config.thresholds };
    const failed = this.gates.filter((gate) => gate.fails(context)).map((gate) => gate.reason);
    return sortReasons([...top.flags, ...failed]);
  }
}
