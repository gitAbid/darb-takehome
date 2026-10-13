import { riyadhDay } from '@/lib/domain/riyadh-day';
import { compareLast4 } from '@/lib/services/matching/signals/card-comparison';

import { formatMoney } from './format';

export type Tone = 'match' | 'close' | 'mismatch' | 'unknown';

export interface Comparison {
  label: string;
  tone: Tone;
}

/** How the charged amount relates to the document total, in reviewer language. */
export function compareAmount(documentAmount: number | null, charged: number, currency: string): Comparison {
  if (documentAmount === null) return { label: 'No total on document', tone: 'unknown' };
  const difference = charged - documentAmount;
  if (Math.abs(difference) <= 5) return { label: 'Exact', tone: 'match' };
  const percent = Math.round((Math.abs(difference) / documentAmount) * 100);
  const direction = difference > 0 ? '+' : '−';
  const label = `${direction}${formatMoney(Math.abs(difference), currency)} (${percent}%)`;
  return {
    label: difference > 0 ? `${label} · tip?` : label,
    tone: percent <= 20 && difference > 0 ? 'close' : 'mismatch',
  };
}

/** Calendar-day distance between document and transaction (Riyadh days). */
export function compareDay(documentDate: Date | null, transactionAt: Date): Comparison {
  const documentDay = documentDate === null ? null : riyadhDay(documentDate);
  const transactionDay = riyadhDay(transactionAt);
  if (documentDay === null || transactionDay === null) return { label: 'No date on document', tone: 'unknown' };
  const gap = transactionDay - documentDay;
  if (gap === 0) return { label: 'Same day', tone: 'match' };
  const days = `${Math.abs(gap)} day${Math.abs(gap) === 1 ? '' : 's'}`;
  return {
    label: gap > 0 ? `Charged ${days} later` : `Charged ${days} earlier`,
    tone: Math.abs(gap) <= 1 ? 'close' : 'mismatch',
  };
}

export function compareCard(documentLast4: string | null, cardLast4: string): Comparison {
  switch (compareLast4(documentLast4, cardLast4)) {
    case 'EQUAL':
      return { label: `•••• ${cardLast4}`, tone: 'match' };
    case 'ONE_DIGIT':
      return { label: `Receipt ${documentLast4} vs ${cardLast4} · misread?`, tone: 'close' };
    case 'DIFFERENT':
      return { label: `Receipt ${documentLast4} vs ${cardLast4}`, tone: 'mismatch' };
    case 'ABSENT':
      return { label: `•••• ${cardLast4} · not on receipt`, tone: 'unknown' };
  }
}
