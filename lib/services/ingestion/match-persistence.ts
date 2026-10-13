import type { DocumentStatus } from '@/lib/domain/statuses';
import type { NewMatch } from '@/lib/repositories/records';
import type { MatchOutcome, MatchResult } from '@/lib/services/matching/types';

const STATUS_BY_OUTCOME: Readonly<Record<MatchOutcome, DocumentStatus>> = {
  AUTO_MATCHED: 'MATCHED',
  NEEDS_REVIEW: 'NEEDS_REVIEW',
  UNMATCHED: 'UNMATCHED',
};

export const SYSTEM_DECIDER = 'system';

export function documentStatusFor(outcome: MatchOutcome): DocumentStatus {
  return STATUS_BY_OUTCOME[outcome];
}

/**
 * Matcher result → rows to persist. Auto-match: the winner AUTO_CONFIRMED, runners-up REJECTED by the system (audit
 * trail, D8). Review: every kept candidate stays a CANDIDATE for a human.
 */
export function matchesToPersist(result: MatchResult, decidedAt: Date): NewMatch[] {
  return result.candidates.map((candidate, index) => {
    const isAutoWinner = result.outcome === 'AUTO_MATCHED' && index === 0;
    const isSystemRejected = result.outcome === 'AUTO_MATCHED' && index > 0;
    return {
      transactionId: candidate.transactionId,
      rank: index + 1,
      confidence: candidate.confidence,
      signals: candidate.signals,
      flags: candidate.flags,
      status: isAutoWinner ? 'AUTO_CONFIRMED' : isSystemRejected ? 'REJECTED' : 'CANDIDATE',
      decidedBy: isAutoWinner || isSystemRejected ? SYSTEM_DECIDER : null,
      decidedAt: isAutoWinner || isSystemRejected ? decidedAt : null,
    };
  });
}

/** When the auto-match lost a race for the transaction's confirmed slot: keep every candidate for review instead. */
export function demoteToReview(result: MatchResult): MatchResult {
  return { ...result, outcome: 'NEEDS_REVIEW', reasons: ['TXN_ALREADY_HAS_DOCUMENT'] };
}
