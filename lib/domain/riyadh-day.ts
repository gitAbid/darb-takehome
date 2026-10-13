const MS_PER_DAY = 86_400_000;
const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;
const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const LOCAL_DATE_TIME = /^(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/;

/**
 * Calendar day in Asia/Riyadh (fixed UTC+3, no daylight saving) as a day count since 1970-01-01.
 * Date-only and zone-less strings are read as Riyadh local dates, never as UTC midnight.
 * Returns null for anything that is not a valid date.
 */
export function riyadhDay(value: Date | string): number | null {
  if (typeof value === 'string') return riyadhDayFromString(value.trim());
  return riyadhDayFromInstant(value.getTime());
}

function riyadhDayFromString(value: string): number | null {
  const localDate = DATE_ONLY.exec(value) ?? LOCAL_DATE_TIME.exec(value);
  if (localDate) return dayFromCalendarDate(Number(localDate[1]), Number(localDate[2]), Number(localDate[3]));
  return riyadhDayFromInstant(Date.parse(value));
}

function riyadhDayFromInstant(epochMs: number): number | null {
  if (!Number.isFinite(epochMs)) return null;
  return Math.floor((epochMs + RIYADH_OFFSET_MS) / MS_PER_DAY);
}

function dayFromCalendarDate(year: number, month: number, day: number): number | null {
  const epochMs = Date.UTC(year, month - 1, day);
  const date = new Date(epochMs);
  const isRealDate = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
  return isRealDate ? epochMs / MS_PER_DAY : null;
}
