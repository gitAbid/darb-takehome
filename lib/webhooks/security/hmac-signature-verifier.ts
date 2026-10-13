import { createHmac } from 'node:crypto';

import { constantTimeEqual } from './constant-time';
import type { SignatureCheck, SignatureVerifier } from './signature-verifier';

const PREFIX = 'sha256=';

/**
 * `<header>: sha256=<hex HMAC-SHA256 of the raw body>` — Meta's X-Hub-Signature-256 scheme, reused for the email and
 * card-feed endpoints. Computed over the exact bytes received: re-serialized JSON would not match.
 */
export class HmacSha256SignatureVerifier implements SignatureVerifier {
  constructor(
    private readonly secret: string,
    private readonly header: string,
  ) {}

  verify(rawBody: Buffer, headers: Headers): SignatureCheck {
    const provided = headers.get(this.header)?.trim();
    if (!provided) return { ok: false, reason: 'MISSING_SIGNATURE' };
    const expected = PREFIX + createHmac('sha256', this.secret).update(rawBody).digest('hex');
    return constantTimeEqual(provided.toLowerCase(), expected)
      ? { ok: true }
      : { ok: false, reason: 'INVALID_SIGNATURE' };
  }
}
