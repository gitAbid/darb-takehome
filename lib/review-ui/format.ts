const RIYADH = 'Asia/Riyadh';

const dayFormat = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: RIYADH,
});
const timeFormat = new Intl.DateTimeFormat('en-GB', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: RIYADH,
});

/** Halalas → "SAR 1,234.50". */
export function formatMoney(halalas: number | null, currency: string | null = 'SAR'): string {
  if (halalas === null) return '—';
  const value = (halalas / 100).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${currency ?? 'SAR'} ${value}`;
}

/** Calendar day in Riyadh, e.g. "14 Jun 2025". Date-only values are stored as UTC midnight of that day. */
export function formatDay(date: Date | null): string {
  return date === null ? '—' : dayFormat.format(date);
}

export function formatDayTime(date: Date): string {
  return `${dayFormat.format(date)}, ${timeFormat.format(date)}`;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago". */
export function formatAge(date: Date, now: Date): string {
  const minutes = Math.max(0, Math.round((now.getTime() - date.getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  return hours < 48 ? `${hours} h ago` : `${Math.round(hours / 24)} d ago`;
}

export function formatPercent(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}
