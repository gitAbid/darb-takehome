import { LogEvents } from '@/lib/logging/log-events';
import type { Logger } from '@/lib/logging/logger';
import type { MatchResult } from '@/lib/services/matching/types';

/** One structured `match.decided` event per decision — the matcher itself never logs (it is pure). */
export function logMatchDecision(logger: Logger, result: MatchResult, context: Record<string, unknown> = {}): void {
  logger.info(LogEvents.MatchDecided, {
    ...context,
    outcome: result.outcome,
    reasons: result.reasons,
    topConfidence: result.candidates[0]?.confidence ?? null,
    candidateCount: result.candidates.length,
  });
}
