/** Why a webhook request was not authenticated. */
export type SignatureFailure = 'MISSING_SIGNATURE' | 'INVALID_SIGNATURE';

export type SignatureCheck = { ok: true } | { ok: false; reason: SignatureFailure };

/** Authenticates a webhook delivery from its raw body bytes and headers (Strategy: one per provider scheme). */
export interface SignatureVerifier {
  verify(rawBody: Buffer, headers: Headers): SignatureCheck;
}

/** Used when no secret is configured (local development): every delivery is accepted, and startup logs a warning. */
export class UnsignedRequestsAccepted implements SignatureVerifier {
  verify(): SignatureCheck {
    return { ok: true };
  }
}
