const MASK = '•••';
const MASK_CHAR = '•';
const PHONE_PATTERN = /^\+?\d{8,15}$/;
const PHONE_VISIBLE_PREFIX = 5;
const PHONE_VISIBLE_SUFFIX = 3;

/**
 * Masks a phone number, keeping the country code + first subscriber digit and the last 3 digits:
 * `+966551234567` → `+9665•••••567`. Anything that is not a plausible phone number is fully masked.
 */
export function maskPhone(phone: string): string {
  if (!PHONE_PATTERN.test(phone)) return MASK;
  const hidden = phone.length - PHONE_VISIBLE_PREFIX - PHONE_VISIBLE_SUFFIX;
  return phone.slice(0, PHONE_VISIBLE_PREFIX) + MASK_CHAR.repeat(hidden) + phone.slice(-PHONE_VISIBLE_SUFFIX);
}

/** Masks the local part of an email, keeping its first character: `fleet@najd.example` → `f•••@najd.example`. */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  const hasLocalPart = at > 0;
  const hasDomain = at < email.length - 1;
  if (!hasLocalPart || !hasDomain) return MASK;
  return email[0] + MASK + email.slice(at);
}
