/** Expected review outcomes are values, not exceptions: the UI shows each one differently. */
export const REVIEW_ERROR_CODES = [
  'MATCH_NOT_FOUND',
  'MATCH_NOT_PENDING',
  'TRANSACTION_ALREADY_HAS_DOCUMENT',
  'DOCUMENT_ALREADY_MATCHED',
] as const;

export type ReviewErrorCode = (typeof REVIEW_ERROR_CODES)[number];

export type ConfirmOutcome =
  | { ok: true; result: 'confirmed' | 'alreadyConfirmed'; matchId: number; documentId: number }
  | { ok: false; code: ReviewErrorCode };

export type RejectOutcome =
  | {
      ok: true;
      result: 'rejected' | 'alreadyRejected';
      matchId: number;
      documentId: number;
      remainingCandidates: number;
    }
  | { ok: false; code: ReviewErrorCode };

/** Thrown inside a unit of work to roll it back; converted to an `{ ok: false }` outcome at the service boundary. */
export class ReviewRejection extends Error {
  constructor(readonly code: ReviewErrorCode) {
    super(code);
    this.name = 'ReviewRejection';
  }
}
