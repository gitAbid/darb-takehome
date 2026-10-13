/**
 * Turns "as printed" strings from the model into domain values. Pure and conservative: anything ambiguous becomes
 * null, which lowers extraction confidence and sends the document to review rather than guessing.
 */
const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;
const AMOUNT = /^(\d+)(?:\.(\d{1,2}))?$/;
const YEAR_FIRST = /(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/;
const DAY_FIRST = /(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/;
const MIN_YEAR = 2000; // also rejects Hijri years (14xx), which would need a calendar conversion
const CURRENCY_ALIASES: Readonly<Record<string, string>> = { 'ر.س': 'SAR', SR: 'SAR', ريال: 'SAR', 'د.إ': 'AED' };

/** Arabic-Indic digits and separators → ASCII ("٥٧٫٥٠" → "57.50"). */
export function toAsciiDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - ARABIC_INDIC_ZERO))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - EXTENDED_ARABIC_INDIC_ZERO))
    .replace(/٫/g, '.')
    .replace(/٬/g, ',');
}

/** "SAR 1,234.50" → 123450 halalas; "57,50" (decimal comma) → 5750; zero, negative or unclear → null. */
export function parseAmountToHalalas(value: string | null): number | null {
  if (value === null) return null;
  let digits = toAsciiDigits(value).replace(/[^\d.,-]/g, '');
  if (digits.includes('-')) return null;
  digits = /^\d+,\d{2}$/.test(digits) ? digits.replace(',', '.') : digits.replace(/,/g, '');
  const match = AMOUNT.exec(digits);
  if (match === null) return null;
  const halalas = Number(match[1]) * 100 + Number((match[2] ?? '0').padEnd(2, '0'));
  return halalas > 0 ? halalas : null;
}

/** First calendar date in the text, year-first or day-first (the Saudi convention) → "YYYY-MM-DD"; else null. */
export function parseDateAsPrinted(value: string | null): string | null {
  if (value === null) return null;
  const text = toAsciiDigits(value);
  const yearFirst = YEAR_FIRST.exec(text);
  const dayFirst = DAY_FIRST.exec(text);
  if (yearFirst !== null) return isoDate(yearFirst[1], yearFirst[2], yearFirst[3]);
  if (dayFirst !== null) return isoDate(dayFirst[3], dayFirst[2], dayFirst[1]);
  return null;
}

export function normalizeVatNumber(value: string | null): string | null {
  const digits = onlyDigits(value);
  return digits?.length === 15 ? digits : null;
}

export function normalizeCardLast4(value: string | null): string | null {
  const digits = onlyDigits(value);
  return digits !== null && digits.length >= 4 ? digits.slice(-4) : null;
}

export function normalizeCurrency(value: string | null): string | null {
  const trimmed = value?.trim() ?? '';
  const code = CURRENCY_ALIASES[trimmed] ?? trimmed.toUpperCase();
  return /^[A-Z]{3}$/.test(code) ? code : null;
}

export function normalizeText(value: string | null): string | null {
  const trimmed = value?.replace(/\s+/g, ' ').trim() ?? '';
  return trimmed === '' ? null : trimmed;
}

function onlyDigits(value: string | null): string | null {
  return value === null ? null : toAsciiDigits(value).replace(/\D/g, '');
}

function isoDate(year: string, month: string, day: string): string | null {
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  const valid =
    Number(year) >= MIN_YEAR && date.getUTCMonth() === Number(month) - 1 && date.getUTCDate() === Number(day);
  return valid ? date.toISOString().slice(0, 10) : null;
}
