import type { WebhookSecurityConfig } from '@/lib/config/app-config';
import { LogEvents } from '@/lib/logging/log-events';
import type { Logger } from '@/lib/logging/logger';

import { HmacSha256SignatureVerifier } from './hmac-signature-verifier';
import { UnsignedRequestsAccepted, type SignatureVerifier } from './signature-verifier';

export const SIGNATURE_HEADERS = {
  /** Meta's header for WhatsApp Cloud API deliveries. */
  whatsapp: 'x-hub-signature-256',
  /** Our assumption for the inbound-email provider and the card feed (same scheme, IMPLEMENTATION.md D36). */
  email: 'x-signature-256',
  transactions: 'x-signature-256',
} as const;

export type WebhookVerifiers = Record<keyof typeof SIGNATURE_HEADERS, SignatureVerifier>;

/** One verifier per endpoint: HMAC when its secret is set, otherwise unsigned requests are accepted — loudly. */
export function createWebhookVerifiers(config: WebhookSecurityConfig, logger: Logger): WebhookVerifiers {
  const verifier = (channel: keyof WebhookVerifiers, secret: string | null): SignatureVerifier => {
    if (secret !== null) return new HmacSha256SignatureVerifier(secret, SIGNATURE_HEADERS[channel]);
    logger.warn(LogEvents.WebhookSignatureDisabled, { channel });
    return new UnsignedRequestsAccepted();
  };
  return {
    email: verifier('email', config.emailSecret),
    whatsapp: verifier('whatsapp', config.whatsappAppSecret),
    transactions: verifier('transactions', config.transactionsSecret),
  };
}
