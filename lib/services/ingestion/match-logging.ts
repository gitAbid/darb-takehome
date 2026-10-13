import { LogEvents } from '@/lib/logging/log-events';
import type { Logger } from '@/lib/logging/logger';
import type { MatchResult } from '@/lib/services/matching/types';

/** Candidates listed at debug level; the matcher keeps at most a handful above the review threshold anyway. */
const MAX_LOGGED_CANDIDATES = 5;

/**
 * One structured `match.decided` event per decision — the matcher itself never logs (it is pure). At debug level, the
 * scored candidates and filter counts behind it, so "why did this match / not match" is answerable from the logs.
 */
export function logMatchDecision(logger: Logger, result: MatchResult, context: Record<string, unknown> = {}): void {
  logger.debug(LogEvents.MatchCandidates, {
    ...context,
    excluded: result.excluded,
    candidates: result.candidates.slice(0, MAX_LOGGED_CANDIDATES).map((candidate) => ({
      transactionId: candidate.transactionId,
      confidence: candidate.confidence,
      signals: candidate.signals,
      flags: candidate.flags,
    })),
  });
  logger.info(LogEvents.MatchDecided, {
    ...context,
    outcome: result.outcome,
    reasons: result.reasons,
    topConfidence: result.candidates[0]?.confidence ?? null,
    candidateCount: result.candidates.length,
  });
}
