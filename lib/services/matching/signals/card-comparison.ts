const LAST4 = /^\d{4}$/;

export type CardComparison = 'EQUAL' | 'ONE_DIGIT' | 'DIFFERENT' | 'ABSENT';

/**
 * Compares two card last-4 values. One differing digit is a plausible OCR misread; two or more is another card.
 * ABSENT when either side is missing or not four digits.
 */
export function compareLast4(a: string | null, b: string | null): CardComparison {
  const left = a?.trim() ?? '';
  const right = b?.trim() ?? '';
  if (!LAST4.test(left) || !LAST4.test(right)) return 'ABSENT';
  const differingDigits = [...left].filter((digit, index) => digit !== right[index]).length;
  if (differingDigits === 0) return 'EQUAL';
  return differingDigits === 1 ? 'ONE_DIGIT' : 'DIFFERENT';
}
