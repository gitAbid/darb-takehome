/**
 * Race outcomes SQLite cannot produce (it serializes transactions) but a concurrent database would: the review service
 * must still answer correctly when its guarded update loses to another decision.
 */
import { FixedClock } from '@/lib/domain/clock';
import type { MatchStatus } from '@/lib/domain/statuses';
import { RecordingLogger } from '@/lib/logging/recording-logger';
import type { MatchDecisionResult, StoredMatch } from '@/lib/repositories/records';
import type { Repositories, UnitOfWork } from '@/lib/repositories/unit-of-work';
import { ReviewService } from '@/lib/services/review/review-service';

const candidate: StoredMatch = {
  id: 7,
  documentId: 3,
  transactionId: 1,
  rank: 1,
  confidence: 1,
  signals: {},
  flags: [],
  status: 'CANDIDATE',
  decidedBy: null,
  decidedAt: null,
};

/** A unit of work whose `decide` returns `decision`, and whose re-read then shows the match as `afterRace`. */
function serviceWhere(decision: MatchDecisionResult, afterRace: MatchStatus = 'CANDIDATE'): ReviewService {
  const reads = [candidate, { ...candidate, status: afterRace }];
  const repositories = {
    matches: {
      findById: async () => reads.shift() ?? null,
      decide: async () => decision,
      countPending: async () => 0,
    },
  } as unknown as Repositories;
  const unitOfWork: UnitOfWork = { run: (work) => work(repositories) };
  return new ReviewService({ unitOfWork, clock: new FixedClock(new Date()), logger: new RecordingLogger() });
}

describe('review decisions under concurrency', () => {
  it('treats losing to an identical decision as a no-op, and to a different one as not pending', async () => {
    expect(
      await Promise.all([
        serviceWhere({ kind: 'stale' }, 'CONFIRMED').confirm(7, 'r'),
        serviceWhere({ kind: 'stale' }, 'REJECTED').reject(7, 'r'),
        serviceWhere({ kind: 'stale' }, 'REJECTED').confirm(7, 'r'),
      ]),
    ).toEqual([
      { ok: true, result: 'alreadyConfirmed', matchId: 7, documentId: 3 },
      { ok: true, result: 'alreadyRejected', matchId: 7, documentId: 3, remainingCandidates: 0 },
      { ok: false, code: 'MATCH_NOT_PENDING' },
    ]);
  });

  it('maps a confirmed-slot conflict on either side to its review code', async () => {
    expect(
      await Promise.all([
        serviceWhere({ kind: 'conflict', field: 'confirmedTransactionId' }).confirm(7, 'r'),
        serviceWhere({ kind: 'conflict', field: 'confirmedDocumentId' }).confirm(7, 'r'),
      ]),
    ).toEqual([
      { ok: false, code: 'TRANSACTION_ALREADY_HAS_DOCUMENT' },
      { ok: false, code: 'DOCUMENT_ALREADY_MATCHED' },
    ]);
  });

  it('lets unexpected failures propagate (the action reports a server error)', async () => {
    const failing = new ReviewService({
      unitOfWork: { run: () => Promise.reject(new Error('database down')) },
      clock: new FixedClock(new Date()),
      logger: new RecordingLogger(),
    });
    await expect(failing.confirm(7, 'r')).rejects.toThrow('database down');
  });
});
