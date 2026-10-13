const E164_DIGITS = /^[1-9]\d{7,14}$/;

/** Normalizes a phone number to E.164 (`+966551234567`). WhatsApp sends digits without '+'. Null when invalid. */
export function toE164(raw: string): string | null {
  const digits = raw.trim().replace(/^\+/, '').replace(/[\s-]/g, '');
  return E164_DIGITS.test(digits) ? `+${digits}` : null;
}
