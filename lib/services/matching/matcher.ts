import type { Decision, DecisionPolicy } from './decision/decision-policy';
import type { CandidateFilter } from './filters/candidate-filter';
import { prepareDocument } from './prepared-document';
import { rankCandidates } from './ranking';
import { scoreCandidate } from './scoring';
import type { SignalScorer } from './signals/signal-scorer';
import type { MerchantNormalizer } from './text/merchant-normalizer';
import {
  FILTER_NAMES,
  type CandidateTransaction,
  type ExtractedFields,
  type FilterName,
  type MatchDocumentFn,
  type MatchResult,
  type PreparedDocument,
  type ScoredCandidate,
  type SignalName,
} from './types';

export interface MatcherDependencies {
  normalizer: MerchantNormalizer;
  filters: readonly CandidateFilter[];
  scorers: readonly SignalScorer[];
  weights: Readonly<Record<SignalName, number>>;
  policy: DecisionPolicy;
}

/**
 * Builds the pure matching function: prepare → filter → score → rank → decide.
 * No I/O, no clock, no randomness: the same input always gives the same result.
 */
export function createMatcher(deps: MatcherDependencies): MatchDocumentFn {
  return (fields: ExtractedFields, transactions: readonly CandidateTransaction[]): MatchResult => {
    const doc = prepareDocument(fields, deps.normalizer);
    if (doc === null)
      return toResult({ outcome: 'UNMATCHED', reasons: ['NOT_MATCHABLE'], candidates: [] }, noExclusions());
    const { survivors, excluded } = applyFilters(doc, transactions, deps.filters);
    const scored = survivors.map((transaction) => scoreCandidate(doc, transaction, deps.scorers, deps.weights));
    return toResult(deps.policy.decide(doc, rankCandidates(scored)), excluded);
  };
}

function toResult(decision: Decision, excluded: Record<FilterName, number>): MatchResult {
  return {
    outcome: decision.outcome,
    candidates: decision.candidates.map(toMatchCandidate),
    reasons: decision.reasons,
    excluded,
  };
}

function noExclusions(): Record<FilterName, number> {
  return Object.fromEntries(FILTER_NAMES.map((name) => [name, 0])) as Record<FilterName, number>;
}

function applyFilters(
  doc: PreparedDocument,
  transactions: readonly CandidateTransaction[],
  filters: readonly CandidateFilter[],
): { survivors: CandidateTransaction[]; excluded: Record<FilterName, number> } {
  const excluded = noExclusions();
  const survivors = transactions.filter((transaction) => {
    const failed = filters.find((filter) => !filter.accepts(doc, transaction));
    if (failed) excluded[failed.name] += 1;
    return failed === undefined;
  });
  return { survivors, excluded };
}

function toMatchCandidate(candidate: ScoredCandidate) {
  return {
    transactionId: candidate.transaction.id,
    confidence: candidate.confidence,
    signals: candidate.signals,
    flags: candidate.flags,
  };
}
