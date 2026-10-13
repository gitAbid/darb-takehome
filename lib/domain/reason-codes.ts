/** Every reason an outcome can carry, in the order they are reported. */
export const REASON_CODES = [
  'ALL_GATES_PASSED',
  'BELOW_AUTO_THRESHOLD',
  'AMOUNT_TIP_TOLERANCE',
  'AMOUNT_NOT_EXACT',
  'WEAK_IDENTITY',
  'NEAR_TIE',
  'LOW_OCR_CONFIDENCE',
  'TXN_ALREADY_HAS_DOCUMENT',
  'CARD_POSSIBLE_MISREAD',
  'NOT_MATCHABLE',
  'NO_CANDIDATES',
  'LOW_SCORE',
  'UNKNOWN_SENDER',
] as const;

/** Warnings attached to a single candidate; each one also blocks auto-matching. */
export const CANDIDATE_FLAGS = ['AMOUNT_TIP_TOLERANCE', 'CARD_POSSIBLE_MISREAD'] as const;

export type ReasonCode = (typeof REASON_CODES)[number];
export type CandidateFlag = (typeof CANDIDATE_FLAGS)[number];

/** De-duplicates reasons and returns them in the canonical order above, so results are deterministic. */
export function sortReasons(reasons: Iterable<ReasonCode>): ReasonCode[] {
  const present = new Set(reasons);
  return REASON_CODES.filter((code) => present.has(code));
}
