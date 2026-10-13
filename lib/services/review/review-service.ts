import type { Clock } from '@/lib/domain/clock';
import { isConfirmedMatchStatus } from '@/lib/domain/statuses';
import { LogEvents } from '@/lib/logging/log-events';
import type { Logger } from '@/lib/logging/logger';
import type { StoredMatch } from '@/lib/repositories/records';
import type { Repositories, UnitOfWork } from '@/lib/repositories/unit-of-work';
import { changeDocumentStatus } from '@/lib/services/ingestion/document-state-machine';

import { ReviewRejection, type ConfirmOutcome, type RejectOutcome, type ReviewErrorCode } from './review-outcome';

export interface ReviewDependencies {
  unitOfWork: UnitOfWork;
  clock: Clock;
  logger: Logger;
}

/**
 * Reviewer decisions on candidate matches. Each runs in one database transaction; double-submits and races are
 * resolved by guarded updates and unique constraints (one confirmed document per transaction), not by UI state.
 */
export class ReviewService {
  constructor(private readonly deps: ReviewDependencies) {}

  confirm(matchId: number, reviewer: string): Promise<ConfirmOutcome> {
    return this.decide('confirm', matchId, reviewer, (repositories, match) =>
      this.applyConfirm(repositories, match, reviewer),
    );
  }

  reject(matchId: number, reviewer: string): Promise<RejectOutcome> {
    return this.decide('reject', matchId, reviewer, (repositories, match) =>
      this.applyReject(repositories, match, reviewer),
    );
  }

  private async decide<T extends ConfirmOutcome | RejectOutcome>(
    action: 'confirm' | 'reject',
    matchId: number,
    reviewer: string,
    apply: (repositories: Repositories, match: StoredMatch) => Promise<T>,
  ): Promise<T | { ok: false; code: ReviewErrorCode }> {
    const logger = this.deps.logger.child({ matchId, reviewer, action });
    try {
      const outcome = await this.deps.unitOfWork.run(async (repositories) => {
        const match = await repositories.matches.findById(matchId);
        if (match === null) throw new ReviewRejection('MATCH_NOT_FOUND');
        return apply(repositories, match);
      });
      logger.info(action === 'confirm' ? LogEvents.ReviewConfirmed : LogEvents.ReviewRejected, { ...outcome });
      return outcome;
    } catch (error) {
      if (!(error instanceof ReviewRejection)) throw error;
      logger.warn(LogEvents.ReviewConflict, { code: error.code });
      return { ok: false, code: error.code };
    }
  }

  private async applyConfirm(
    repositories: Repositories,
    match: StoredMatch,
    reviewer: string,
  ): Promise<ConfirmOutcome> {
    const done = { ok: true as const, matchId: match.id, documentId: match.documentId };
    if (isConfirmedMatchStatus(match.status)) return { ...done, result: 'alreadyConfirmed' };
    const decidedAt = this.deps.clock.now();
    if ((await decideCandidate(repositories, match, 'CONFIRMED', reviewer, decidedAt)) === 'alreadyDecided') {
      return { ...done, result: 'alreadyConfirmed' };
    }
    await repositories.matches.rejectPendingSiblings(match.documentId, match.id, reviewer, decidedAt);
    await changeDocumentStatus(repositories.documents, { id: match.documentId, from: 'NEEDS_REVIEW', to: 'MATCHED' });
    return { ...done, result: 'confirmed' };
  }

  private async applyReject(repositories: Repositories, match: StoredMatch, reviewer: string): Promise<RejectOutcome> {
    const done = { ok: true as const, matchId: match.id, documentId: match.documentId };
    const alreadyRejected = async (): Promise<RejectOutcome> => ({
      ...done,
      result: 'alreadyRejected',
      remainingCandidates: await repositories.matches.countPending(match.documentId),
    });
    if (match.status === 'REJECTED') return alreadyRejected();
    const decidedAt = this.deps.clock.now();
    if ((await decideCandidate(repositories, match, 'REJECTED', reviewer, decidedAt)) === 'alreadyDecided') {
      return alreadyRejected();
    }
    const remainingCandidates = await repositories.matches.countPending(match.documentId);
    if (remainingCandidates === 0) {
      await changeDocumentStatus(repositories.documents, {
        id: match.documentId,
        from: 'NEEDS_REVIEW',
        to: 'UNMATCHED',
      });
    }
    return { ...done, result: 'rejected', remainingCandidates };
  }
}

/**
 * Moves a CANDIDATE to `to` with a guarded update. A unique-constraint conflict becomes its review code; losing a race
 * to an identical concurrent decision is "already decided" (a double-submit), to anything else "not pending".
 */
async function decideCandidate(
  repositories: Repositories,
  match: StoredMatch,
  to: 'CONFIRMED' | 'REJECTED',
  reviewer: string,
  decidedAt: Date,
): Promise<'decided' | 'alreadyDecided'> {
  if (match.status !== 'CANDIDATE') throw new ReviewRejection('MATCH_NOT_PENDING');
  const result = await repositories.matches.decide({ id: match.id, to, decidedBy: reviewer, decidedAt });
  if (result.kind === 'updated') return 'decided';
  if (result.kind === 'conflict') throw new ReviewRejection(conflictCode(result.field));
  if ((await repositories.matches.findById(match.id))?.status === to) return 'alreadyDecided';
  throw new ReviewRejection('MATCH_NOT_PENDING');
}

function conflictCode(field: 'confirmedTransactionId' | 'confirmedDocumentId'): ReviewErrorCode {
  return field === 'confirmedTransactionId' ? 'TRANSACTION_ALREADY_HAS_DOCUMENT' : 'DOCUMENT_ALREADY_MATCHED';
}
