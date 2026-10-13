const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses an extracted document date for storage. A date-only value becomes UTC midnight of that calendar date
 * (it is a Riyadh calendar date; riyadhDay() reads it back to the same day). Unparseable values become null.
 */
export function parseDocumentDate(value: string | null): Date | null {
  if (value === null) return null;
  const trimmed = value.trim();
  const date = new Date(DATE_ONLY.test(trimmed) ? `${trimmed}T00:00:00.000Z` : trimmed);
  return Number.isNaN(date.getTime()) ? null : date;
}
