import type { ReasonCode } from '@/lib/domain/reason-codes';

export type ReasonTone = 'success' | 'warning' | 'danger' | 'neutral';

export interface ReasonCopy {
  label: string;
  /** One sentence telling the reviewer what to check. */
  hint: string;
  tone: ReasonTone;
}

/** Reason codes in reviewer language (IMPLEMENTATION.md §3.6). */
export const REASON_COPY: Readonly<Record<ReasonCode, ReasonCopy>> = {
  ALL_GATES_PASSED: { label: 'Auto-matched', hint: 'Every safety check passed.', tone: 'success' },
  BELOW_AUTO_THRESHOLD: {
    label: 'Low confidence',
    hint: 'Similar, but not similar enough to attach automatically.',
    tone: 'warning',
  },
  AMOUNT_TIP_TOLERANCE: {
    label: 'Tip?',
    hint: 'Card charged more than the receipt — check for a tip line.',
    tone: 'warning',
  },
  AMOUNT_NOT_EXACT: {
    label: 'Amount differs',
    hint: 'Charged amount is close to, but not the receipt total.',
    tone: 'warning',
  },
  WEAK_IDENTITY: {
    label: 'Weak identity',
    hint: 'No card digits and the merchant name barely matches.',
    tone: 'warning',
  },
  NEAR_TIE: {
    label: 'Look-alikes',
    hint: 'Two candidates are almost equally likely — pick the right one.',
    tone: 'warning',
  },
  LOW_OCR_CONFIDENCE: {
    label: 'Blurry scan',
    hint: 'The OCR was unsure of what it read — check the image.',
    tone: 'warning',
  },
  TXN_ALREADY_HAS_DOCUMENT: {
    label: 'Already documented',
    hint: 'This transaction already has a confirmed document — possible duplicate.',
    tone: 'danger',
  },
  CARD_POSSIBLE_MISREAD: {
    label: 'Card digit?',
    hint: 'One card digit differs — likely an OCR misread.',
    tone: 'warning',
  },
  NOT_MATCHABLE: { label: 'Unreadable', hint: 'No usable amount or date was extracted.', tone: 'danger' },
  NO_CANDIDATES: { label: 'No transaction', hint: 'No transaction fits yet — it may arrive later.', tone: 'neutral' },
  LOW_SCORE: { label: 'No good match', hint: 'Nothing scored high enough to show.', tone: 'neutral' },
  UNKNOWN_SENDER: { label: 'Unknown sender', hint: 'The sender is not linked to any client.', tone: 'danger' },
};
