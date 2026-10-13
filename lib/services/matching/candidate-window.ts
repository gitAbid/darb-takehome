import { parseDocumentDate } from '@/lib/domain/document-date';

import type { DateRules } from './matching-config';

const MS_PER_DAY = 86_400_000;

/**
 * The transactionAt range worth loading for a document dated `documentDate`: wide enough for every document type's
 * date window plus a day of timezone slack on each side. The matcher applies the exact per-type window afterwards.
 */
export function candidateWindow(
  documentDate: string | null,
  rules: Pick<DateRules, 'windows'>,
): { from: Date; to: Date } | null {
  const date = parseDocumentDate(documentDate);
  if (date === null) return null;
  const windows = Object.values(rules.windows);
  const earliestGap = Math.max(...windows.map((window) => window.maxDays));
  const latestGap = Math.min(...windows.map((window) => window.minDays));
  return {
    from: new Date(date.getTime() - (earliestGap + 1) * MS_PER_DAY),
    to: new Date(date.getTime() + (1 - latestGap) * MS_PER_DAY),
  };
}
