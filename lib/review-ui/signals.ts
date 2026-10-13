/** The weighted signals in display order, with reviewer-facing names. */
export const DISPLAYED_SIGNALS = [
  { key: 'amount', label: 'Amount' },
  { key: 'date', label: 'Date' },
  { key: 'merchant', label: 'Merchant' },
  { key: 'card', label: 'Card' },
] as const;

export type ConfidenceTone = 'high' | 'medium' | 'low';

/** Same bands as the decision gates: ≥ 0.85 could auto-match, ≥ 0.50 is worth reviewing. */
export function confidenceTone(confidence: number): ConfidenceTone {
  if (confidence >= 0.85) return 'high';
  return confidence >= 0.5 ? 'medium' : 'low';
}
