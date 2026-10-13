import type { MatchDecision, MatchDecisionResult, NewMatch, StoredMatch } from './records';

export interface MatchRepository {
  /** Persists ranked candidates; confirmed statuses also claim the one-confirmed-per-transaction slot. */
  createMany(documentId: number, matches: readonly NewMatch[]): Promise<void>;
  findById(id: number): Promise<StoredMatch | null>;
  listForDocument(documentId: number): Promise<StoredMatch[]>;
  /** Moves a CANDIDATE to CONFIRMED/REJECTED; reports stale state or a uniqueness conflict instead of throwing. */
  decide(decision: MatchDecision): Promise<MatchDecisionResult>;
  /** Rejects every other CANDIDATE of the document; returns how many were rejected. */
  rejectPendingSiblings(documentId: number, exceptMatchId: number, decidedBy: string, decidedAt: Date): Promise<number>;
  countPending(documentId: number): Promise<number>;
}
